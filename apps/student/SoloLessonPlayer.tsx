import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { X, Heart, ArrowRight, ArrowLeft, Volume2, ChevronRight, Star, BookOpen, Zap, Play, Pause, VolumeX, RotateCw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoloSession } from '../../store/SoloSessionContext';
import { MediaService } from '../../services/MediaService';
import { getVocabulary, getCharacters } from '../../services/manifest';
import { supabase } from '../../services/supabaseClient';
import { selectLessonItems, prepareUnitForStudent } from '../../services/poolService';
import { contentForStep, friendlyTitle } from '../../services/gameRouting';
import { completeStage, starsForAccuracy } from '../../services/stageProgressService';
import type { StudentStage } from '../../types/stage';
import { playAudioUrl } from '../../services/SpeechService';
import { Engine } from '../../services/SupabaseService';
import { playCue } from '../board/templates/playCue';
import ExerciseRunner from './exercises/ExerciseRunner';
import WordLab from './WordLab';
import ReactPlayer from 'react-player/lazy';

// Real game engines as in-lesson steps (Student Path): engine-routed block
// types (see services/gameRouting.ts) play their shared game engine, not the
// exercise battery. Lazy so the engines stay out of the player's main bundle.
const FastVocabStep = lazy(() => import('./steps/FastVocabStep'));
const SpellingBeeStep = lazy(() => import('./steps/SpellingBeeStep'));
const WordSearchStep = lazy(() => import('./steps/WordSearchStep'));
const MemoryMatchStep = lazy(() => import('./steps/MemoryMatchStep'));

interface SoloLessonPlayerProps {
  onComplete: (results: { xp: number; accuracy: number; time: string; stars?: number }) => void;
  onExit: () => void;
}

const SoloLessonPlayer: React.FC<SoloLessonPlayerProps> = ({ onComplete, onExit }) => {
  const { state, nextSlide, prevSlide, goToSlide, addPoints, triggerAction } = useSoloSession();

  const flow = state.activeUnit?.flow || [];
  const currentStep = state.activeSlideData;
  const currentIndex = state.currentStepIndex;
  const totalSteps = flow.length;
  // The student-path node in play (null = full-flow legacy lesson).
  const activeStage = (state as any).activeStage as StudentStage | null;

  // Real DB hearts state (02 F1: read-only, display only, never gate; keep '—' fallback)
  const [hearts, setHearts] = useState<number | null>(null);
  const [heartsUnavailable, setHeartsUnavailable] = useState(true);
  const [lives, setLives] = useState(5);

  // Accidental exit prevention modal (02 F2)
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Speed Quiz state (07 F1)
  const [isRevealed, setIsRevealed] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isWrongAnswer, setIsWrongAnswer] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [activeQuizIndex, setActiveQuizIndex] = useState(0);

  // Grammar sandbox state (06)
  const [heardGrammarExamples, setHeardGrammarExamples] = useState<Set<number>>(new Set());
  const [selectedGrammarQuizOption, setSelectedGrammarQuizOption] = useState<number | null>(null);

  // Story stage state (05)
  const [activePageIndex, setActivePageIndex] = useState(0);
  // P-E: the story word currently popped-up (tapped in the story text).
  const [storyWord, setStoryWord] = useState<any>(null);

  // Media player state (04)
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaProgress, setMediaProgress] = useState(0);
  const [mediaTime, setMediaTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const playerRef = useRef<any>(null);

  // Pool-driven exercise battery (Phase 2.5-2.6). Loaded when the current step
  // is a PRACTICE/ASSESS block; the ExerciseRunner self-completes and advances.
  const [studentId, setStudentId] = useState<string>('');
  const [exerciseItems, setExerciseItems] = useState<any[]>([]);
  const [exerciseLoading, setExerciseLoading] = useState(false);

  const progress = totalSteps > 0 ? ((currentIndex + 1) / totalSteps) * 100 : 0;
  const startTime = React.useRef(Date.now());

  useEffect(() => {
    startTime.current = Date.now();
  }, []);

  // Resolve the student id once (the auth user).
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (user) setStudentId(user.id);
      })
      .catch(() => {});
  }, []);

  // Load real hearts on mount / studentId available (02 F1).
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    Engine.getHearts(studentId)
      .then((h) => {
        if (!cancelled) {
          setHearts(h.current);
          setHeartsUnavailable(false);
        }
      })
      .catch(() => {
        if (!cancelled) setHeartsUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Step routing (audit 2026-09-10 F1): the block's TYPE decides its content.
  const unitId = state.activeUnit?.id || '';
  const contentSpec = contentForStep(currentStep?.type);
  const isEngineStep = contentSpec?.kind === 'engine';
  const isPoolStep =
    !isEngineStep &&
    Boolean(
      contentSpec?.kind === 'pool' ||
        contentSpec?.kind === 'pool-all' ||
        currentStep?.data?.poolDriven ||
        currentStep?.phase === 'PRACTICE' ||
        currentStep?.phase === 'ASSESS',
    );
  // Variety seed: re-rolled per step so replays shuffle within the pedagogical arc.
  const [varietySeed, setVarietySeed] = useState(() => (Math.random() * 0x7fffffff) | 0);

  // Load the battery for the current pool-driven step.
  useEffect(() => {
    if (!isPoolStep || !unitId || !studentId) {
      setExerciseItems([]);
      return;
    }
    let cancelled = false;
    setExerciseLoading(true);
    (async () => {
      await prepareUnitForStudent(unitId, studentId);
      const items = await selectLessonItems(unitId, studentId, 14, {
        types: contentSpec?.kind === 'pool' ? contentSpec.types : undefined,
        signature: contentSpec?.kind === 'pool' ? contentSpec.signature : undefined,
        interleave: contentSpec?.kind === 'pool-all' ? contentSpec.interleave : undefined,
        seed: varietySeed,
      });
      if (!cancelled) {
        setExerciseItems(items);
        setExerciseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPoolStep, unitId, studentId, currentIndex, currentStep?.type, varietySeed]);

  useEffect(() => {
    const unit = state.activeUnit;
    if (unit?.id) {
      const vocab = getVocabulary(unit.manifest).map((v) => ({
        word: v.word,
        context_sentence: v.example_sentence,
        image_url: (v as any).image_url,
      }));
      if (vocab.length > 0) {
        MediaService.preloadUnitAssets(unit.id, vocab);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeUnit?.id]);

  useEffect(() => {
    setIsRevealed(false);
    setSelectedOption(null);
    setIsWrongAnswer(false);
    setActivePageIndex(0);
    setActiveQuizIndex(0);
    setStoryWord(null);
    setHeardGrammarExamples(new Set());
    setSelectedGrammarQuizOption(null);
    setMediaError(false);
    setVarietySeed((Math.random() * 0x7fffffff) | 0);
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalSteps - 1) {
      nextSlide();
    } else {
      const elapsed = Math.floor((Date.now() - startTime.current) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const accuracy =
        state.totalAttempts > 0 ? Math.round((state.totalCorrect / state.totalAttempts) * 100) : 100;
      const xp = Math.max(1, state.score + 3) + (activeStage?.xpReward ?? 0);
      // Student-path node completion: persist stars (best kept, replays counted).
      if (activeStage && studentId && unitId) {
        completeStage(studentId, unitId, activeStage.id, accuracy).catch((e) =>
          console.warn('[SoloLessonPlayer] stage completion not recorded', e),
        );
      }
      onComplete({
        xp,
        accuracy,
        time: `${minutes}:${seconds.toString().padStart(2, '0')}`,
        stars: starsForAccuracy(accuracy),
      });
    }
  }, [
    currentIndex,
    totalSteps,
    nextSlide,
    onComplete,
    state.score,
    state.totalCorrect,
    state.totalAttempts,
    activeStage,
    studentId,
    unitId,
  ]);

  const handlePrev = () => {
    if (currentIndex > 0) prevSlide();
  };

  const handleExitClick = () => {
    // If on intro splash before starting, exit directly without modal (no progress made).
    // Once lesson is underway, show the kid-friendly confirm modal to prevent accidental data loss (02 F2).
    if (currentStep?.type === 'INTRO_SPLASH') {
      onExit();
    } else {
      setShowExitConfirm(true);
    }
  };

  if (!currentStep) {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#FDFBF7] border-2 border-[#E2D7C3] flex items-center justify-center mb-3 shadow-sm">
          <BookOpen size={36} className="text-[#8C7A68]" />
        </div>
        <h2 className="text-xl font-fredoka font-bold text-[#1D3557] mb-2">No Lesson Loaded</h2>
        <p className="text-[#8C7A68] text-sm mb-6">Select a unit from the map to start a lesson.</p>
        <button
          onClick={onExit}
          className="bg-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] active:translate-y-0.5 text-white px-6 py-3 rounded-2xl font-fredoka font-bold"
        >
          Go Back
        </button>
      </div>
    );
  }

  /* =========================================================================
   * STEP 1: INTRO_SPLASH (stitch/02-lesson-shell/1.html)
   * ========================================================================= */
  const renderIntroSplash = () => {
    const title = currentStep.data?.title || state.activeUnit?.title || 'In the City';
    const subtitle = currentStep.data?.subtitle || state.activeUnit?.topic || '城市探索 • 探索新单词与故事';
    const unitBadge = activeStage?.title || (state.activeUnit ? `UNIT ${state.activeUnit.id.slice(0, 4)}` : 'UNIT 1 • LESSON 1');

    return (
      <div className="flex-1 w-full flex flex-col justify-center items-center px-4 py-3 overflow-y-auto">
        {/* Central Hero Card */}
        <div className="w-full max-w-[340px] bg-[#FDFBF7] rounded-[24px] border-2 border-[#E2D7C3] shadow-[0_10px_25px_-4px_rgba(71,55,38,0.10)] px-4 py-4 flex flex-col items-center text-center relative overflow-hidden my-auto">
          {/* Decorative subtle confetti / stars */}
          <div className="absolute top-3 left-3 text-[#E76F51] opacity-70 text-xs font-bold select-none">✦</div>
          <div className="absolute top-4 right-4 text-[#E9C46A] opacity-80 text-sm font-bold select-none">★</div>
          <div className="absolute bottom-12 right-3 text-[#2A9D8F] opacity-70 text-xs font-bold select-none">◆</div>

          {/* Unit Badge Pill */}
          <div className="inline-flex items-center px-3.5 py-1 rounded-full bg-[#E76F51] text-white text-[11px] font-fredoka font-bold tracking-wider uppercase shadow-sm mb-1.5">
            {unitBadge}
          </div>

          {/* Unit Title */}
          <h1 className="font-fredoka text-[26px] font-bold text-[#1D3557] leading-tight tracking-tight mt-0.5">
            {title}
          </h1>

          {/* Chinese Support Subtitle */}
          <p className="text-[13px] font-semibold text-[#8C7A68] mt-0.5 tracking-wide">{subtitle}</p>

          {/* Hero Illustration: Professor Owl with Explorer Hat & Magnifying Glass */}
          <div className="w-full max-w-[270px] h-[160px] my-2 relative flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 300 190" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="5" y="5" width="290" height="180" rx="18" fill="#F4EFE6" />
              <circle cx="150" cy="110" r="82" fill="#EAE0D0" opacity="0.6" />

              {/* City Backdrop */}
              <rect x="32" y="55" width="34" height="100" rx="4" fill="#C9D6DF" />
              <rect x="40" y="65" width="6" height="8" rx="1" fill="#FFFFFF" />
              <rect x="52" y="65" width="6" height="8" rx="1" fill="#FFFFFF" />
              <rect x="234" y="62" width="36" height="92" rx="4" fill="#E8D5C4" />
              <rect x="242" y="74" width="7" height="9" rx="1" fill="#FAF3EB" />
              <rect x="254" y="74" width="7" height="9" rx="1" fill="#FAF3EB" />
              <path d="M68 85 L85 68 L102 85 V155 H68 V85Z" fill="#F4A261" opacity="0.85" />
              <rect x="198" y="75" width="38" height="80" rx="5" fill="#2A9D8F" opacity="0.4" />

              {/* Traffic light & Tree */}
              <line x1="22" y1="100" x2="22" y2="155" stroke="#7D6F61" strokeWidth="3" strokeLinecap="round" />
              <rect x="15" y="82" width="14" height="28" rx="4" fill="#264653" />
              <circle cx="22" cy="89" r="2.8" fill="#E76F51" />
              <circle cx="22" cy="96" r="2.8" fill="#E9C46A" />
              <circle cx="22" cy="103" r="2.8" fill="#2A9D8F" />

              <rect x="272" y="125" width="6" height="30" rx="2" fill="#8C7A68" />
              <circle cx="275" cy="115" r="14" fill="#2A9D8F" />

              {/* Ground & Road lines */}
              <rect x="10" y="152" width="280" height="26" rx="8" fill="#D5C7B0" />
              <line x1="25" y1="165" x2="45" y2="165" stroke="#FDFBF7" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="60" y1="165" x2="80" y2="165" stroke="#FDFBF7" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="220" y1="165" x2="240" y2="165" stroke="#FDFBF7" strokeWidth="2.5" strokeLinecap="round" />

              {/* Mascot Shadow */}
              <ellipse cx="150" cy="155" rx="36" ry="7" fill="#7D6F61" opacity="0.22" />

              {/* Owl Mascot */}
              <ellipse cx="150" cy="120" rx="38" ry="34" fill="#6B4F3A" />
              <ellipse cx="150" cy="126" rx="24" ry="22" fill="#F4EFE6" />
              <path d="M142 120 C146 123 154 123 158 120" stroke="#CBBBA6" strokeWidth="2" strokeLinecap="round" />
              <path d="M140 128 C145 132 155 132 160 128" stroke="#CBBBA6" strokeWidth="2" strokeLinecap="round" />

              {/* Wings */}
              <path d="M115 116 C110 126 114 138 122 142 C125 138 126 126 124 118 Z" fill="#583F2E" />
              <path d="M182 118 C188 122 196 120 200 112 C194 108 186 112 182 118 Z" fill="#583F2E" />

              {/* Feet */}
              <ellipse cx="140" cy="153" rx="7" ry="3.5" fill="#E9C46A" />
              <ellipse cx="160" cy="153" rx="7" ry="3.5" fill="#E9C46A" />

              {/* Eyes */}
              <circle cx="136" cy="110" r="14" fill="#FFFFFF" />
              <circle cx="164" cy="110" r="14" fill="#FFFFFF" />
              <circle cx="137" cy="110" r="8" fill="#1D3557" />
              <circle cx="163" cy="110" r="8" fill="#1D3557" />
              <circle cx="135" cy="107" r="3.2" fill="#FFFFFF" />
              <circle cx="161" cy="107" r="3.2" fill="#FFFFFF" />

              {/* Beak */}
              <polygon points="150,114 144,124 156,124" fill="#E76F51" />

              {/* Glasses */}
              <circle cx="136" cy="110" r="16.5" stroke="#2A9D8F" strokeWidth="3" fill="none" />
              <circle cx="164" cy="110" r="16.5" stroke="#2A9D8F" strokeWidth="3" fill="none" />
              <path d="M149 110 L151 110" stroke="#2A9D8F" strokeWidth="3.5" strokeLinecap="round" />

              {/* Safari Hat */}
              <ellipse cx="150" cy="92" rx="42" ry="9" fill="#E9C46A" />
              <path d="M130 90 C130 73 170 73 170 90 Z" fill="#E9C46A" />
              <rect x="130" y="85" width="40" height="5" rx="1.5" fill="#E76F51" />

              {/* Magnifying Glass */}
              <line x1="195" y1="116" x2="208" y2="132" stroke="#6B4F3A" strokeWidth="4.5" strokeLinecap="round" />
              <circle cx="190" cy="108" r="15" stroke="#E9C46A" strokeWidth="3.5" fill="#EAE0D0" fillOpacity={0.35} />
            </svg>
          </div>

          {/* Roadmap Header */}
          <div className="w-full flex items-center justify-center gap-2 mb-1.5">
            <span className="h-[1px] bg-[#E2D7C3] flex-1"></span>
            <span className="font-fredoka text-[12px] font-bold text-[#8C7A68] tracking-wider uppercase">
              What we'll do today
            </span>
            <span className="h-[1px] bg-[#E2D7C3] flex-1"></span>
          </div>

          {/* Learning Roadmap Chips */}
          <div className="w-full space-y-2 mb-2">
            <div className="w-full py-2 px-3 bg-[#E9C46A] text-[#1D3557] rounded-xl flex items-center gap-2.5 border border-[#D5B055] shadow-xs">
              <span className="text-base leading-none">📚</span>
              <span className="font-fredoka text-[13px] font-bold tracking-wide text-left">
                Vocabulary Study <span className="text-[11px] font-normal opacity-85">(Word Lab)</span>
              </span>
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/40 text-[#1D3557]">
                Step 1
              </span>
            </div>

            <div className="w-full py-2 px-3 bg-[#2A9D8F] text-white rounded-xl flex items-center gap-2.5 border border-[#1E6F5C] shadow-xs">
              <span className="text-base leading-none">📖</span>
              <span className="font-fredoka text-[13px] font-bold tracking-wide text-left">
                Story &amp; Grammar Explorer
              </span>
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/15 text-white">
                Step 2-3
              </span>
            </div>

            <div className="w-full py-2 px-3 bg-[#E91E63] text-white rounded-xl flex items-center gap-2.5 border border-[#B7154A] shadow-xs">
              <span className="text-base leading-none">⚡</span>
              <span className="font-fredoka text-[13px] font-bold tracking-wide text-left">
                Speed Quiz Challenge
              </span>
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/15 text-white">
                Step 4
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* =========================================================================
   * STEP 2: FOCUS_CARDS -> WordLab (stitch/03-word-lab/1.html & 3.html)
   * ========================================================================= */
  const renderFocusCards = () => {
    const vocab = getVocabulary(state.activeUnit?.manifest);
    if (vocab.length === 0) return <EmptyStep title="Vocabulary Cards" />;
    return <WordLab cards={vocab} onReady={handleNext} />;
  };

  /* =========================================================================
   * STEP 3: SPEED_QUIZ (stitch/07-speed-quiz/1.html & 2.html)
   * With 07 F1 in-place acoustic correction & retry teaching beat
   * ========================================================================= */
  const renderSpeedQuiz = () => {
    const questions = currentStep.data?.questions || [];
    if (questions.length === 0) return <EmptyStep title="Quiz" />;
    const question = questions[activeQuizIndex];
    if (!question) return <EmptyStep title="Quiz" />;

    const isLastQuestion = activeQuizIndex >= questions.length - 1;

    const handleSelectQuizOption = (option: string) => {
      if (isRevealed) return;
      setSelectedOption(option);
      const correct = option === question.correct;
      setIsRevealed(true);

      if (correct) {
        setIsWrongAnswer(false);
        playCue('correct');
        setQuizScore((s) => s + 1);
        addPoints('solo', 1);
        toast.success('+1 XP!', { icon: '⭐' });
      } else {
        setIsWrongAnswer(true);
        playCue('wrong');
        setLives((l) => Math.max(0, l - 1));
      }
    };

    const handleQuizAdvance = () => {
      if (isLastQuestion) {
        handleNext();
      } else {
        setIsRevealed(false);
        setSelectedOption(null);
        setIsWrongAnswer(false);
        setActiveQuizIndex((i) => i + 1);
      }
    };

    return (
      <div className="flex-1 overflow-y-auto px-4 py-3.5 flex flex-col justify-between max-w-[420px] mx-auto w-full">
        <div>
          {/* Subheader Badge */}
          <div className="flex items-center justify-between mb-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E76F51] text-[#FDFBF7] font-fredoka font-bold text-xs uppercase tracking-wider shadow-sm">
              <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
              SPEED QUIZ • QUESTION {activeQuizIndex + 1} OF {questions.length}
            </span>
            <span className="text-xs font-extrabold text-[#8C7A68] bg-[#FDFBF7] px-2.5 py-1 rounded-full border border-[#E2D7C3]">
              ⚡ {quizScore} Correct
            </span>
          </div>

          {/* Question Box Card */}
          <div className="bg-[#FDFBF7] rounded-[24px] border-2 border-[#E2D7C3] p-4 mb-3 shadow-[0_4px_0_#D4C5AD] relative">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="font-fredoka font-bold text-[19px] text-[#1D3557] leading-tight">
                  {question.text}
                </h2>
                {question.translation && (
                  <p className="text-[13px] font-bold text-[#8C7A68] mt-1.5">{question.translation}</p>
                )}
              </div>

              {/* Question Audio FAB */}
              <button
                type="button"
                onClick={() => playAudioUrl(question.audio, question.text)}
                className="w-11 h-11 min-w-[44px] rounded-2xl bg-[#1CB0F6] shadow-[0_3px_0_#0284C7] active:translate-y-0.5 active:shadow-none text-white flex items-center justify-center shrink-0 cursor-pointer"
                title="Listen to question"
              >
                <Volume2 size={20} className="fill-current" />
              </button>
            </div>
          </div>

          {/* 4 Stacked Option Cards */}
          <div className="space-y-2.5">
            {question.options?.map((option: string, i: number) => {
              const letter = String.fromCharCode(65 + i);
              const isCorrectOption = option === question.correct;
              const isSelectedOption = option === selectedOption;

              let cardStyle =
                'bg-[#FDFBF7] border-2 border-[#E2D7C3] shadow-[0_3px_0_#D4C5AD] text-[#264653] hover:border-[#2A9D8F]/60';
              let badgeStyle = 'bg-[#F7F3E8] border border-[#E2D7C3] text-[#8C7A68]';

              if (isRevealed) {
                if (isCorrectOption) {
                  cardStyle = 'bg-[#E6F4F1] border-[2.5px] border-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] text-[#1E6F5C]';
                  badgeStyle = 'bg-[#2A9D8F] text-white';
                } else if (isSelectedOption && !isCorrectOption) {
                  cardStyle = 'bg-[#FEF2F2] border-[2.5px] border-[#FF4B4B] shadow-[0_4px_0_#DC2626] text-[#FF4B4B]';
                  badgeStyle = 'bg-[#FF4B4B] text-white';
                } else {
                  cardStyle = 'bg-[#FDFBF7]/70 border border-[#E2D7C3] opacity-50 text-[#8C7A68]';
                }
              }

              return (
                <button
                  key={i}
                  type="button"
                  disabled={isRevealed}
                  onClick={() => handleSelectQuizOption(option)}
                  className={`w-full min-h-[56px] px-3.5 py-2.5 rounded-[20px] flex items-center justify-between transition-all text-left active:translate-y-0.5 ${cardStyle}`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span
                      className={`w-8 h-8 rounded-xl font-fredoka font-bold text-sm flex items-center justify-center shrink-0 ${badgeStyle}`}
                    >
                      {letter}
                    </span>
                    <span
                      className={`font-fredoka font-bold text-[16px] leading-tight truncate ${
                        isRevealed && isSelectedOption && !isCorrectOption ? 'line-through decoration-2' : ''
                      }`}
                    >
                      {option}
                    </span>
                  </div>

                  {isRevealed && isCorrectOption && (
                    <div className="w-7 h-7 rounded-full bg-[#2A9D8F] flex items-center justify-center text-white shrink-0 shadow-xs">
                      <Check size={16} strokeWidth={3.5} />
                    </div>
                  )}

                  {isRevealed && isSelectedOption && !isCorrectOption && (
                    <div className="w-7 h-7 rounded-full bg-[#FF4B4B] flex items-center justify-center text-white shrink-0 shadow-xs font-bold text-sm">
                      ✕
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Correct Celebration Streak Card */}
          {isRevealed && !isWrongAnswer && (
            <div className="mt-3 p-3 rounded-[20px] bg-[#E6F4F1] border-2 border-[#2A9D8F] flex items-center justify-between shadow-sm animate-pulse">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎉</span>
                <div>
                  <div className="font-fredoka font-bold text-[14px] text-[#2A9D8F] leading-tight">
                    Awesome! +1 XP earned!
                  </div>
                  <div className="text-[11px] font-extrabold text-[#1E6F5C]">
                    Great speed! Keep moving forward!
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-white text-[#E76F51] border border-[#E76F51]/30 px-2.5 py-1 rounded-full font-fredoka font-bold text-xs shadow-xs">
                <span>🔥</span>
                <span>Streak!</span>
              </div>
            </div>
          )}

          {/* 07 F1 Wrong Answer: Acoustic Corrective Teaching Drawer */}
          {isRevealed && isWrongAnswer && (
            <div className="mt-3 bg-[#FEF2F2] border-t-2 border-[#FF4B4B] rounded-2xl p-3.5 shadow-md flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#FF4B4B] text-white flex items-center justify-center text-xs font-black shrink-0">
                    ✕
                  </div>
                  <h3 className="font-fredoka font-bold text-[15px] text-[#1D3557]">Remember for next time!</h3>
                </div>
                <span className="bg-[#E9C46A]/40 text-[#8C5D00] border border-[#E9C46A] px-2 py-0.5 rounded-full text-[10px] font-bold">
                  🔄 Retry at round end
                </span>
              </div>

              {/* Acoustic Narration Bar */}
              <div className="bg-[#F7F3E8] rounded-xl p-2.5 border border-[#E2D7C3] flex items-center justify-between gap-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-wider font-extrabold text-[#2A9D8F] font-fredoka flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F] animate-pulse"></span>
                    Correct Answer
                  </p>
                  <p className="font-fredoka font-bold text-[15px] text-[#1D3557] mt-0.5 leading-snug">
                    “{question.correct}”
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => playAudioUrl(undefined, question.correct)}
                  className="w-11 h-11 rounded-full bg-[#2A9D8F] shadow-[0_3px_0_#1E6F5C] active:translate-y-0.5 text-white flex items-center justify-center shrink-0 cursor-pointer"
                  title="Speak correct answer"
                >
                  <Volume2 size={18} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Next Button inside SpeedQuiz */}
        {isRevealed && (
          <div className="pt-3">
            <button
              type="button"
              onClick={handleQuizAdvance}
              className={`w-full h-12 rounded-2xl font-fredoka font-bold text-base flex items-center justify-center gap-2 active:translate-y-0.5 transition-all cursor-pointer ${
                isWrongAnswer
                  ? 'bg-[#E76F51] shadow-[0_4px_0_#C4553B] text-white hover:bg-[#D96346]'
                  : 'bg-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] text-white hover:bg-[#248B7E]'
              }`}
            >
              <span>{isWrongAnswer ? 'GOT IT' : isLastQuestion ? 'FINISH QUIZ' : 'CONTINUE'}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    );
  };

  /* =========================================================================
   * STEP 4: STORY_STAGE (stitch/05-story-stage/1.html & 2.html)
   * With 05 F1/F2 padded hit pills + tap-outside popup dismiss
   * ========================================================================= */
  const renderStoryStage = () => {
    const pages = currentStep.data?.pages || [];
    if (pages.length === 0) return <EmptyStep title="Story" />;
    const page = pages[activePageIndex];
    if (!page) return <EmptyStep title="Story" />;

    const vocab = getVocabulary(state.activeUnit?.manifest);
    const vocabMap = new Map<string, any>();
    for (const v of vocab) if (v.word) vocabMap.set(v.word.toLowerCase(), v);

    const chars = getCharacters(state.activeUnit?.manifest);
    const charByName = new Map<string, any>(chars.map((c: any) => [String(c.name || '').toLowerCase(), c]));
    const speakerPortrait = page.speaker
      ? charByName.get(String(page.speaker).toLowerCase())?.image_url || page.portrait || null
      : null;

    const renderStoryTextWithPills = (text: string) => {
      return (text || '').split(/(\s+)/).map((tok, i) => {
        const cleaned = tok.replace(/[^a-zA-Z']/g, '').toLowerCase();
        const v = vocabMap.get(cleaned);

        if (v && cleaned) {
          return (
            <span key={i} className="inline-block my-0.5">
              <button
                type="button"
                onClick={() => {
                  setStoryWord(v);
                  playCue('reveal');
                  playAudioUrl(v.audio_url, v.word);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl bg-[#FFF7ED] border-b-2 border-[#E76F51] text-[#E76F51] font-fredoka font-bold text-[16px] cursor-pointer hover:bg-[#FED7AA] active:scale-95 transition-all shadow-xs"
                title="Tap for meaning"
              >
                <span>{tok}</span>
                <span className="text-[11px] opacity-75">✨</span>
              </button>
            </span>
          );
        }
        return <span key={i}>{tok}</span>;
      });
    };

    return (
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col justify-between max-w-[420px] mx-auto w-full relative">
        {/* Storybook Card */}
        <div className="bg-[#FDFBF7] rounded-[24px] border-2 border-[#E2D7C3] p-3.5 shadow-sm flex flex-col justify-between min-h-[480px]">
          {/* Top Story Header Tag */}
          <div className="flex items-center justify-between pb-2 border-b border-[#F0E8DC]">
            <div className="flex items-center gap-1.5 bg-[#FFF4E8] text-[#E76F51] px-2.5 py-0.5 rounded-full border border-[#FCD5B5]">
              <span className="w-2 h-2 rounded-full bg-[#E76F51]"></span>
              <span className="font-fredoka text-xs font-bold uppercase tracking-wide">Story Stage • Reader</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-fredoka text-[#8C7A68] bg-[#F7F3E8] px-2 py-0.5 rounded-full border border-[#E2D7C3]">
              <span>
                Page {activePageIndex + 1} of {pages.length}
              </span>
            </div>
          </div>

          {/* Scene Illustration Frame */}
          <div className="relative w-full h-[180px] rounded-2xl overflow-hidden border-2 border-[#E2D7C3] bg-[#DFF1F5] mt-2 shadow-inner flex items-center justify-center">
            {page.image_url || page.image || page.imageUrl ? (
              <img
                src={page.image_url || page.image || page.imageUrl}
                alt={page.speaker || 'Story scene'}
                className="w-full h-full object-cover object-center"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-[#8C7A68]">
                <span className="text-5xl mb-1">🏙️</span>
                <span className="font-fredoka text-xs font-bold">Storybook Illustration</span>
              </div>
            )}
            <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-[#E2D7C3] text-[10px] font-bold text-[#264653]">
              Sunny Avenue
            </div>
          </div>

          {/* Character Dialogue Row */}
          <div className="flex items-center gap-2.5 pt-2 pb-1">
            <div className="w-10 h-10 rounded-full bg-[#FFE5DF] border-2 border-[#E76F51] flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
              {speakerPortrait ? (
                <img src={speakerPortrait} alt={page.speaker} className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg">👧</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-fredoka font-bold text-[15px] text-[#E76F51] block leading-tight">
                {page.speaker || 'Story'} says:
              </span>
              <span className="text-[10px] font-semibold text-[#8C7A68]">Tap colored words to learn meaning 👆</span>
            </div>
          </div>

          {/* Story Text Container */}
          <div className="bg-[#FAF7F0] rounded-xl border border-[#E2D7C3] p-3.5 my-1">
            <p className="text-[17px] leading-[1.8] font-bold text-[#264653] tracking-wide">
              {renderStoryTextWithPills(page.text)}
            </p>
          </div>

          {/* Reading Interaction Bar (Read along + 48px page navigation) */}
          <div className="pt-2 border-t border-[#E2D7C3] flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={() => playAudioUrl(page.audio, page.text)}
              className="h-11 px-3.5 rounded-2xl bg-[#2A9D8F] shadow-[0_3px_0_#1E6F5C] active:translate-y-0.5 active:shadow-none text-white font-fredoka font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              title="Read Along"
            >
              <Volume2 size={16} />
              <span>Read Along</span>
            </button>

            {/* Page Nav Arrows & Dots */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActivePageIndex((p) => Math.max(0, p - 1))}
                disabled={activePageIndex === 0}
                className="w-10 h-10 rounded-xl bg-[#F7F3E8] border-2 border-[#E2D7C3] shadow-[0_2px_0_#D4C5AD] active:translate-y-0.5 flex items-center justify-center text-[#264653] font-fredoka font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Previous Page"
              >
                <ArrowLeft size={16} />
              </button>

              <div className="flex items-center gap-1 px-2 py-1.5 bg-[#F7F3E8] rounded-full border border-[#E2D7C3]">
                {pages.map((_: any, i: number) => (
                  <span
                    key={i}
                    className={`h-2 rounded-full transition-all ${
                      i === activePageIndex ? 'w-4 bg-[#E9C46A]' : 'w-2 bg-[#E2D7C3]'
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setActivePageIndex((p) => Math.min(pages.length - 1, p + 1))}
                disabled={activePageIndex >= pages.length - 1}
                className="w-10 h-10 rounded-xl bg-[#F7F3E8] border-2 border-[#E2D7C3] shadow-[0_2px_0_#D4C5AD] active:translate-y-0.5 flex items-center justify-center text-[#264653] font-fredoka font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Next Page"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* 05 F2: Word Popup Modal Card (with tap-outside dismiss) */}
        {storyWord && (
          <div
            onClick={() => setStoryWord(null)}
            className="fixed inset-0 bg-[#264653]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 cursor-pointer"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] bg-[#FDFBF7] border-[2.5px] border-[#2A9D8F] rounded-3xl p-4.5 shadow-2xl flex flex-col relative cursor-default"
            >
              {/* Top Row: Headword & Dismiss Button */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-fredoka font-bold text-[24px] text-[#1D3557] leading-none">
                      {storyWord.word}
                    </h3>
                    <span className="text-[10px] font-fredoka font-bold px-2 py-0.5 rounded-full bg-[#F7F3E8] text-[#8C7A68] border border-[#E2D7C3] uppercase">
                      Vocab
                    </span>
                  </div>
                  {storyWord.phonetic && (
                    <span className="font-mono text-xs text-[#8C7A68] bg-[#F7F3E8] px-2 py-0.5 rounded-md border border-[#E2D7C3] mt-1 inline-block">
                      {storyWord.phonetic}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setStoryWord(null)}
                  className="w-8 h-8 rounded-full bg-[#F7F3E8] border border-[#E2D7C3] text-[#8C7A68] hover:text-[#1D3557] flex items-center justify-center active:scale-95 transition cursor-pointer"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Chinese L1 & Audio Replay */}
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#E2D7C3]/70">
                <div>
                  <span className="text-[10px] font-bold text-[#8C7A68] uppercase tracking-wider block">
                    Chinese Meaning
                  </span>
                  <div className="font-fredoka font-bold text-[18px] text-[#E76F51] leading-tight">
                    {storyWord.l1_translation || storyWord.translation || '释义'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => playAudioUrl(storyWord.audio_url, storyWord.word)}
                  className="w-11 h-11 rounded-full bg-[#1CB0F6] shadow-[0_3px_0_#0284C7] active:translate-y-0.5 text-white flex items-center justify-center cursor-pointer"
                  title="Listen"
                >
                  <Volume2 size={20} className="fill-current" />
                </button>
              </div>

              {/* Definition */}
              {storyWord.definition && (
                <div className="bg-[#F7F3E8] rounded-xl p-2.5 border border-[#E2D7C3] mt-2.5">
                  <span className="text-[10px] font-bold text-[#2A9D8F] uppercase tracking-wide block mb-0.5">
                    📖 Meaning
                  </span>
                  <p className="text-[13px] text-[#264653] font-bold leading-snug">{storyWord.definition}</p>
                </div>
              )}

              {/* Example sentence */}
              {storyWord.example_sentence && (
                <p className="text-[12px] text-[#8C7A68] italic mt-2 px-1">“{storyWord.example_sentence}”</p>
              )}

              <p className="mt-3 text-[11px] text-[#8C7A68] text-center font-medium">
                👆 Tap anywhere outside to return to story
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* =========================================================================
   * STEP 5: GRAMMAR_SANDBOX (stitch/06-grammar-sandbox/1.html & 2.html)
   * ========================================================================= */
  const renderGrammarSandbox = () => {
    const rule = currentStep.data?.rule || 'Past Tense: Regular Verbs (-ed)';
    const explanation =
      currentStep.data?.explanation ||
      'When an action happened in the past, add -ed to the action word!';
    const subtitle = currentStep.data?.subtitle || '规则动词加 -ed 表示过去发生的动作';
    const examples: string[] = currentStep.data?.examples || [
      'Yesterday, Lily walked across the crosswalk.',
      'They played at the city park after school.',
      'Sam watched the cars stop at the red light.',
    ];

    const handleSpeakExample = (idx: number, text: string) => {
      playAudioUrl(undefined, text);
      setHeardGrammarExamples((prev) => new Set(prev).add(idx));
    };

    return (
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 max-w-[420px] mx-auto w-full">
        {/* Subheader */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-fredoka font-bold uppercase tracking-wide bg-[#E76F51] text-white shadow-xs">
            <span className="w-2 h-2 rounded-full bg-white"></span>
            GRAMMAR SANDBOX • RULE &amp; EXAMPLES
          </span>
          <span className="text-[11px] font-bold text-[#8C7A68] bg-[#FDFBF7] px-2.5 py-0.5 rounded-full border border-[#E2D7C3]">
            Grammar Focus
          </span>
        </div>

        {/* Rule Showcase Card */}
        <div className="bg-[#FDFBF7] rounded-[24px] border-2 border-[#E2D7C3] p-4 shadow-sm relative overflow-hidden">
          {/* Owl Speech Bubble */}
          <div className="flex items-start gap-2.5 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-[#E0F2FE] border-2 border-[#BAE6FD] flex items-center justify-center text-2xl shrink-0 shadow-xs">
              🦉
            </div>
            <div className="flex-1 bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-2.5">
              <p className="text-xs font-fredoka font-bold text-[#264653] leading-snug">{explanation}</p>
            </div>
          </div>

          {/* Rule Headline & Audio Button */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h2 className="font-fredoka font-bold text-[20px] text-[#1D3557] leading-tight">{rule}</h2>
              <p className="text-[12px] font-semibold text-[#8C7A68] mt-0.5">{subtitle}</p>
            </div>

            <button
              type="button"
              onClick={() => playAudioUrl(undefined, `${rule}. ${explanation}`)}
              className="w-11 h-11 rounded-2xl bg-[#1CB0F6] shadow-[0_3px_0_#0284C7] active:translate-y-0.5 text-white flex items-center justify-center shrink-0 cursor-pointer"
              title="Listen to rule"
            >
              <Volume2 size={20} className="fill-current" />
            </button>
          </div>

          {/* Formula Pill */}
          <div className="mt-2 bg-[#F7F3E8] rounded-xl p-2 border border-[#E2D7C3] flex items-center justify-center gap-2 text-sm font-fredoka font-bold shadow-xs">
            <span className="px-2.5 py-0.5 rounded-lg bg-[#2A9D8F]/15 text-[#2A9D8F]">walk</span>
            <span className="text-[#8C7A68]">+</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-[#E76F51]/15 text-[#E76F51]">-ed</span>
            <span className="text-[#8C7A68]">=</span>
            <span className="px-3 py-0.5 rounded-lg bg-[#E9C46A] text-[#1D3557] shadow-xs">walked</span>
          </div>
        </div>

        {/* Example Cards */}
        <div className="space-y-2">
          <span className="text-xs font-fredoka font-bold uppercase tracking-wider text-[#264653] px-1 block">
            Syntax Examples ({heardGrammarExamples.size}/{examples.length} heard)
          </span>

          {examples.map((ex, i) => {
            const isHeard = heardGrammarExamples.has(i);

            return (
              <div
                key={i}
                className="bg-[#FDFBF7] rounded-[20px] border-2 border-[#E2D7C3] p-3 shadow-sm flex items-center justify-between gap-3 hover:border-[#2A9D8F]/60 transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-fredoka font-semibold text-[15px] text-[#1D3557] leading-relaxed">{ex}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleSpeakExample(i, ex)}
                  className="w-11 h-11 rounded-2xl bg-[#2A9D8F] shadow-[0_3px_0_#1E6F5C] active:translate-y-0.5 text-white flex items-center justify-center shrink-0 relative cursor-pointer"
                  title="Listen"
                >
                  <Volume2 size={18} className="fill-current" />
                  {isHeard && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#2A9D8F] border-2 border-white rounded-full flex items-center justify-center text-[9px] font-black">
                      ✓
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Quick Check Micro-Challenge */}
        <div className="bg-[#F7F3E8] rounded-2xl border border-[#E2D7C3] p-3 shadow-xs">
          <p className="font-fredoka font-bold text-xs text-[#1D3557] mb-2">
            ⚡ Quick Check: Which word is in the past tense?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {['walk', 'walked', 'walking'].map((opt, i) => {
              const isSelected = selectedGrammarQuizOption === i;
              const isCorrect = opt === 'walked';

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSelectedGrammarQuizOption(i);
                    if (isCorrect) playCue('correct');
                    else playCue('wrong');
                  }}
                  className={`py-2 px-1 rounded-xl font-fredoka font-bold text-xs border transition active:translate-y-0.5 cursor-pointer ${
                    isSelected
                      ? isCorrect
                        ? 'bg-[#2A9D8F] border-[#1E6F5C] text-white shadow-sm'
                        : 'bg-[#FF4B4B] border-[#DC2626] text-white'
                      : 'bg-[#FDFBF7] border-[#E2D7C3] text-[#264653]'
                  }`}
                >
                  {opt} {isSelected && isCorrect ? '✓' : ''}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  /* =========================================================================
   * STEP 6: MEDIA_PLAYER (stitch/04-media-player/1.html & 2.html)
   * Full-bleed UNDIMMED video (04 F1) + Offline / Audio fallback state
   * ========================================================================= */
  const renderMediaPlayer = () => {
    const title = currentStep.data?.title || 'Sing Along & Learn';
    const videoUrl = currentStep.data?.videoUrl || '';
    const audioUrl = currentStep.data?.audioUrl || '';
    const lyrics: { time: number; text: string }[] = currentStep.data?.lyrics || [];

    const hasVideo = Boolean(videoUrl) && !mediaError;
    const hasAudio = Boolean(audioUrl);
    const hasLyrics = lyrics.length > 0;
    const hasContent = hasVideo || hasAudio;

    if (!hasContent && !hasLyrics) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-[#FDFBF7] rounded-2xl shadow-lg border-2 border-[#E2D7C3] p-8 text-center max-w-sm">
            <Volume2 size={40} className="text-[#8C7A68] mx-auto mb-4" />
            <h2 className="text-lg font-fredoka font-bold text-[#1D3557] mb-2">{title}</h2>
            <p className="text-[#8C7A68] text-sm font-medium">No media for this step. Tap Continue.</p>
          </div>
        </div>
      );
    }

    const handleMediaProgress = (progressState: { played: number; playedSeconds: number }) => {
      setMediaProgress(progressState.played);
      setMediaTime(progressState.playedSeconds);
      if (lyrics.length > 0) {
        const activeLyric = [...lyrics].reverse().find((l) => l.time <= progressState.playedSeconds);
        if (activeLyric) {
          setCurrentLineIdx(lyrics.indexOf(activeLyric));
        }
      }
    };

    const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const currentLine = lyrics[currentLineIdx]?.text || 'Sing and move along with the rhythm!';
    const nextLine = lyrics[currentLineIdx + 1]?.text || '';

    return (
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col justify-start max-w-[420px] mx-auto w-full">
        {/* Context Badge */}
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="inline-flex items-center gap-1.5 bg-[#FDFBF7] border border-[#E2D7C3] px-2.5 py-1 rounded-full shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#2A9D8F] animate-ping"></span>
            <span className="font-fredoka text-xs font-semibold text-[#1D3557]">KARAOKE SONG LAB</span>
          </div>
          <span className="text-[11px] font-bold text-[#8C7A68] bg-[#F7F3E8] border border-[#E2D7C3] px-2 py-0.5 rounded-lg">
            {title}
          </span>
        </div>

        {/* 04 F1: UNDIMMED FULL-COLOR VIDEO OR OFFLINE RECOVERY FALLBACK */}
        <div className="relative w-full rounded-[24px] bg-[#1D3557] border-2 border-[#E2D7C3] overflow-hidden shadow-md shrink-0 aspect-video">
          {/* ReactPlayer mounted for both video and audio formats */}
          {(hasVideo || hasAudio) && (
            <ReactPlayer
              ref={playerRef}
              url={hasVideo ? videoUrl : audioUrl}
              playing={isPlaying}
              muted={isMuted}
              width={hasVideo ? '100%' : '0'}
              height={hasVideo ? '100%' : '0'}
              style={
                hasVideo
                  ? { position: 'absolute', top: 0, left: 0 }
                  : { position: 'absolute', width: 0, height: 0, opacity: 0 }
              }
              onProgress={handleMediaProgress}
              onDuration={setMediaDuration}
              onError={() => setMediaError(true)}
              onEnded={() => setIsPlaying(false)}
              config={{
                youtube: { playerVars: { controls: 0, disablekb: 1, modestbranding: 1 } } as any,
              }}
            />
          )}

          {/* Full opacity video overlay */}
          {hasVideo ? (
            <>
              {/* Top Live Badge Overlay */}
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-[#1D3557]/80 backdrop-blur-sm text-white px-2.5 py-1 rounded-full border border-white/20 shadow-sm pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-[#FF4B4B] animate-pulse"></span>
                <span className="font-fredoka text-[11px] font-bold">SING-ALONG</span>
              </div>

              {/* Synchronized Karaoke Bar Overlay */}
              <div className="absolute bottom-0 inset-x-0 bg-[#FDFBF7]/95 backdrop-blur-md border-t-2 border-[#E2D7C3] px-3.5 py-2 flex flex-col justify-center pointer-events-none">
                <p className="font-fredoka text-[16px] leading-tight text-[#1D3557] font-semibold text-center my-0.5">
                  <span className="text-[#E91E63] font-bold underline decoration-[#E91E63] decoration-2">
                    {currentLine}
                  </span>
                </p>
                {hasLyrics && nextLine && (
                  <p className="text-[12px] font-extrabold text-[#8C7A68] text-center italic truncate">
                    {nextLine}
                  </p>
                )}
              </div>
            </>
          ) : (
            /* Audio-Only Fallback Screen inside player box (stitch/04-media-player/2.html) */
            <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-[#1D3557]">
              <div className="w-16 h-16 rounded-full bg-[#264653] border-2 border-white/30 flex items-center justify-center text-3xl shadow-inner mb-1">
                🦉
              </div>
              <p className="font-fredoka font-bold text-white text-sm">{currentLine}</p>
              {hasLyrics && nextLine && (
                <p className="text-white/60 text-xs font-semibold mt-0.5">{nextLine}</p>
              )}
            </div>
          )}
        </div>

        {/* Accessible 48px Transport Scrubber Card */}
        <div className="bg-[#F7F3E8] rounded-2xl p-3.5 mt-3 border-2 border-[#E2D7C3] shadow-sm flex flex-col gap-2 shrink-0">
          {/* Timestamps Row */}
          <div className="flex items-center justify-between mb-1">
            <span className="font-fredoka font-bold text-xs text-[#264653]">{formatTime(mediaTime)}</span>
            <span className="text-[10px] font-extrabold text-[#8C7A68] uppercase font-fredoka">Song Progress</span>
            <span className="font-fredoka font-bold text-xs text-[#8C7A68]">{formatTime(mediaDuration)}</span>
          </div>

          {/* 48px Touch-Target Scrubber */}
          <div
            className="relative h-10 flex items-center cursor-pointer"
            onClick={(e) => {
              const bounds = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width));
              playerRef.current?.seekTo(pct);
            }}
          >
            <div className="w-full h-2.5 bg-[#FDFBF7] rounded-full border-2 border-[#E2D7C3] overflow-hidden relative shadow-inner">
              <div
                className="h-full bg-[#1CB0F6] rounded-full transition-all duration-100"
                style={{ width: `${mediaProgress * 100}%` }}
              />
            </div>
            {/* Tactile thumb */}
            <div
              className="absolute w-[20px] h-[20px] rounded-full bg-[#E76F51] border-2 border-white top-1/2 -translate-y-1/2 -translate-x-1/2 shadow-sm pointer-events-none"
              style={{ left: `${mediaProgress * 100}%` }}
            />
          </div>

          {/* Action Bar (Mute, Play/Pause FAB, Restart) */}
          <div className="flex items-center justify-between pt-1 border-t border-[#E2D7C3]/60">
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="w-11 h-11 rounded-full bg-[#FDFBF7] border-2 border-[#E2D7C3] flex items-center justify-center text-[#264653] shadow-[0_2px_0_#D5C7B0] active:translate-y-0.5 cursor-pointer"
              title="Toggle Mute"
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            {/* 60x60 Primary Play/Pause FAB */}
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-[56px] h-[56px] rounded-full bg-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] active:translate-y-0.5 active:shadow-none text-white flex items-center justify-center cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause size={24} className="fill-current" />
              ) : (
                <Play size={24} className="fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => playerRef.current?.seekTo(0)}
              className="w-11 h-11 rounded-full bg-[#FDFBF7] border-2 border-[#E2D7C3] flex items-center justify-center text-[#E76F51] shadow-[0_2px_0_#D5C7B0] active:translate-y-0.5 cursor-pointer"
              title="Restart"
            >
              <RotateCw size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGenericStep = () => {
    const title = currentStep.data?.title || currentStep.type || 'Activity';

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-[#FDFBF7] rounded-2xl border-2 border-[#E2D7C3] p-8 max-w-sm shadow-sm">
          <BookOpen size={40} className="text-[#8C7A68] mx-auto mb-3" />
          <h2 className="text-lg font-fredoka font-bold text-[#1D3557] mb-1">{title}</h2>
          <p className="text-[#8C7A68] text-sm">Activity ready. Tap continue to proceed.</p>
        </div>
      </div>
    );
  };

  const renderExerciseBattery = () => {
    if (!studentId) return <EmptyStep title="Loading" />;
    if (exerciseLoading) {
      return (
        <div className="flex-1 flex items-center justify-center text-[#8C7A68] font-fredoka font-bold">
          Preparing exercises…
        </div>
      );
    }
    return (
      <div className="h-full">
        <ExerciseRunner
          items={exerciseItems}
          studentId={studentId}
          unitId={unitId}
          title={friendlyTitle(currentStep.type, currentStep.title)}
          onExit={onExit}
          onDone={() => handleNext()}
        />
      </div>
    );
  };

  const renderEngineStep = () => {
    if (contentSpec?.kind !== 'engine') return null;
    const engineProps = {
      unitId,
      unitTitle: state.activeUnit?.title || '',
      onDone: () => handleNext(),
      onExit,
    };
    switch (contentSpec.engine) {
      case 'FAST_VOCAB':
        return <FastVocabStep {...engineProps} waveSize={currentStep.data?.waveSize} />;
      case 'WORD_SEARCH':
        return <WordSearchStep {...engineProps} />;
      case 'MEMORY_MATCH':
        return <MemoryMatchStep unitTitle={engineProps.unitTitle} onDone={engineProps.onDone} onExit={onExit} />;
      default:
        return (
          <SpellingBeeStep
            {...engineProps}
            wordsPerRound={currentStep.data?.wordsPerTurn}
            timerSeconds={currentStep.data?.timerSeconds}
            letterRemoval={currentStep.data?.letterRemoval}
          />
        );
    }
  };

  const renderCurrentStep = () => {
    if (isEngineStep) return renderEngineStep();
    if (isPoolStep) return renderExerciseBattery();
    switch (currentStep.type) {
      case 'INTRO_SPLASH':
        return renderIntroSplash();
      case 'FOCUS_CARDS':
        return renderFocusCards();
      case 'GAME_ARENA':
      case 'SPEED_QUIZ':
        return renderSpeedQuiz();
      case 'STORY_STAGE':
        return renderStoryStage();
      case 'GRAMMAR_SANDBOX':
        return renderGrammarSandbox();
      case 'MEDIA_PLAYER':
        return renderMediaPlayer();
      default:
        return renderGenericStep();
    }
  };

  // WordLab renders its own complete 80px footer, so shell footer is omitted for FOCUS_CARDS.
  const showShellFooter = currentStep.type !== 'FOCUS_CARDS';

  // Battery / engine steps replace the whole screen.
  if (isPoolStep || isEngineStep) {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col font-sans relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`battery-${currentIndex}`}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="h-full w-full"
          >
            {isPoolStep ? (
              renderExerciseBattery()
            ) : (
              <Suspense
                fallback={
                  <div className="h-full flex items-center justify-center text-[#8C7A68] font-bold">Loading…</div>
                }
              >
                {renderEngineStep()}
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // Determine footer button label & behavior
  const getFooterCta = () => {
    if (currentStep.type === 'INTRO_SPLASH') {
      return {
        label: 'START LESSON',
        action: () => {
          playCue('win');
          handleNext();
        },
        disabled: false,
      };
    }
    if (currentStep.type === 'MEDIA_PLAYER') {
      return {
        label: 'CONTINUE TO LESSON',
        action: handleNext,
        disabled: false,
      };
    }
    if (currentStep.type === 'GRAMMAR_SANDBOX') {
      return {
        label: 'TRY EXERCISES',
        action: handleNext,
        disabled: false,
      };
    }
    if (currentStep.type === 'SPEED_QUIZ' || currentStep.type === 'GAME_ARENA') {
      return {
        label: isRevealed
          ? isWrongAnswer
            ? 'GOT IT'
            : activeQuizIndex >= (currentStep.data?.questions?.length || 1) - 1
            ? 'COMPLETE QUIZ'
            : 'NEXT QUESTION'
          : 'CHOOSE AN OPTION',
        action: () => {
          if (isRevealed) {
            const isLast = activeQuizIndex >= (currentStep.data?.questions?.length || 1) - 1;
            if (isLast) {
              handleNext();
            } else {
              setIsRevealed(false);
              setSelectedOption(null);
              setIsWrongAnswer(false);
              setActiveQuizIndex((i) => i + 1);
            }
          }
        },
        disabled: !isRevealed,
      };
    }
    return {
      label: currentIndex >= totalSteps - 1 ? 'FINISH LESSON' : 'CONTINUE',
      action: handleNext,
      disabled: false,
    };
  };

  const footerCta = getFooterCta();

  return (
    <div className="h-full bg-[#EAE0D0] flex flex-col font-sans relative overflow-hidden select-none">
      {/* ================= UNIVERSAL SHELL HEADER (64px) ================= */}
      <header className="w-full h-[64px] bg-[#FDFBF7] border-b-2 border-[#E2D7C3] px-3.5 flex items-center justify-between z-20 shrink-0">
        {/* Left Action: Close Button (48x48px tap target) */}
        <button
          type="button"
          onClick={handleExitClick}
          title="Exit Lesson"
          aria-label="Exit Lesson"
          className="w-12 h-12 rounded-2xl bg-[#F7F3E8] border-2 border-[#E2D7C3] shadow-[0_3px_0_#D5C7B0] active:translate-y-0.5 active:shadow-[0_1px_0_#D5C7B0] flex items-center justify-center text-[#264653] hover:bg-[#FAF7EE] transition-all cursor-pointer"
        >
          <X size={20} strokeWidth={3} className="lucide-x" />
        </button>

        {/* Center: Multi-Segment Progress Tracker */}
        <div
          className="flex items-center gap-1.5 px-2 flex-1 max-w-[200px]"
          aria-label={`Progress: Step ${currentIndex + 1} of ${totalSteps}`}
        >
          {Array.from({ length: Math.max(1, totalSteps) }).map((_, i) => (
            <div
              key={i}
              className={`h-2.5 flex-1 rounded-full transition-all duration-300 ${
                i < currentIndex
                  ? 'bg-[#E91E63]'
                  : i === currentIndex
                  ? 'bg-[#E91E63] ring-2 ring-[#F8BBD0]/50 shadow-sm'
                  : 'bg-[#F7F3E8] border border-[#E2D7C3]'
              }`}
            />
          ))}
        </div>

        {/* Right Indicator: Real Hearts Counter Pill (02 F1) */}
        <div
          className="flex items-center gap-1.5 h-10 px-3 bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-full shadow-sm"
          aria-label="Hearts remaining"
        >
          <Heart size={18} className="text-[#FF4B4B] fill-[#FF4B4B] animate-pulse" />
          <span className="font-fredoka text-[16px] font-bold text-[#264653] leading-none">
            {heartsUnavailable || hearts === null ? '—' : hearts}
          </span>
        </div>
      </header>

      {/* ================= MAIN STAGE CONTAINER ================= */}
      <div className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentStep.type}-${currentIndex}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="h-full w-full flex flex-col"
          >
            {renderCurrentStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ================= UNIVERSAL SHELL FOOTER (80px) ================= */}
      {showShellFooter && (
        <footer className="w-full h-[80px] bg-[#FDFBF7] border-t-2 border-[#E2D7C3] px-4 py-3 flex items-center justify-between gap-3 z-20 shrink-0">
          {/* Back Button */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            aria-label="Back"
            className="h-[52px] px-5 rounded-[18px] bg-[#F7F3E8] text-[#8C7A68] border-2 border-[#E2D7C3] font-fredoka font-bold text-sm flex items-center justify-center gap-1 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_2px_0_#D5C7B0] active:translate-y-0.5 active:shadow-none"
          >
            <ArrowLeft size={18} />
            <span>Back</span>
          </button>

          {/* Primary CTA */}
          <button
            type="button"
            disabled={footerCta.disabled}
            onClick={footerCta.action}
            className={`flex-1 h-[52px] rounded-[18px] flex items-center justify-center gap-2 font-fredoka text-[17px] font-bold tracking-wide transition-all cursor-pointer ${
              footerCta.disabled
                ? 'bg-[#F7F3E8] border-2 border-[#E2D7C3] text-[#8C7A68] cursor-not-allowed opacity-60'
                : 'bg-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px] active:shadow-[0_1px_0_#1E6F5C] text-white hover:bg-[#248B7E]'
            }`}
          >
            <span>{footerCta.label}</span>
            <ArrowRight size={18} />
          </button>
        </footer>
      )}

      {/* ================= EXIT CONFIRMATION MODAL (02 F2) ================= */}
      {showExitConfirm && (
        <div
          onClick={() => setShowExitConfirm(false)}
          className="fixed inset-0 bg-[#264653]/55 backdrop-blur-[2px] z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[390px] bg-[#FDFBF7] border-t-[3px] border-x-[3px] sm:border-[3px] border-[#E2D7C3] rounded-t-[36px] sm:rounded-[36px] px-5 pt-7 pb-6 shadow-[0_-12px_32px_rgba(0,0,0,0.22)] flex flex-col items-center text-center cursor-default"
          >
            {/* Top Drag Indicator */}
            <div className="w-12 h-1.5 bg-[#E2D7C3] rounded-full absolute top-3"></div>

            {/* Caring Mascot Owl */}
            <div className="relative mb-2 mt-1">
              <div className="w-24 h-24 rounded-full bg-[#F7F3E8] flex items-center justify-center text-5xl shadow-inner border border-[#E2D7C3]">
                🥺
              </div>
            </div>

            {/* Headline & Body */}
            <h2 className="font-fredoka font-bold text-[22px] leading-tight text-[#1D3557]">Leave lesson already?</h2>
            <p className="font-nunito font-semibold text-[14px] leading-snug text-[#264653] mt-1.5 px-3">
              If you leave now, you will lose your progress and stars for this lesson.
            </p>
            <p className="font-nunito font-medium text-[12px] text-[#8C7A68] mt-1">
              现在退出将丢失本次课时的所有星星和进度哦！
            </p>

            {/* Loss Prevention Stat Card */}
            <div className="w-full mt-3.5 bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-3 flex items-center justify-around shadow-inner">
              <div className="flex items-center gap-2">
                <span className="text-xl">⭐</span>
                <div className="flex flex-col text-left">
                  <span className="font-fredoka font-bold text-sm text-[#1D3557] leading-none">
                    {state.score > 0 ? Math.min(3, Math.ceil(state.score / 2)) : 1} Stars
                  </span>
                  <span className="text-[10px] font-semibold text-[#8C7A68] mt-0.5">earned so far</span>
                </div>
              </div>

              <div className="w-[1px] h-7 bg-[#E2D7C3]"></div>

              <div className="flex items-center gap-2">
                <span className="text-xl">✨</span>
                <div className="flex flex-col text-left">
                  <span className="font-fredoka font-bold text-sm text-[#2A9D8F] leading-none">
                    +{Math.max(1, state.score + 3) + (activeStage?.xpReward ?? 0)} XP
                  </span>
                  <span className="text-[10px] font-semibold text-[#8C7A68] mt-0.5">pending bonus</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full flex flex-col gap-2.5 mt-4">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="w-full h-[52px] rounded-[20px] bg-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px] active:shadow-[0_1px_0_#1E6F5C] text-white font-fredoka font-bold text-[17px] tracking-wide flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>KEEP LEARNING</span>
                <ArrowRight size={18} />
              </button>

              <button
                type="button"
                onClick={onExit}
                className="w-full h-[50px] rounded-[20px] bg-[#FDFBF7] border-2 border-[#E2D7C3] shadow-[0_3px_0_#D5C7B0] active:translate-y-[2px] text-[#8C7A68] hover:text-[#E76F51] font-bold text-[15px] cursor-pointer"
              >
                Quit Lesson
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const EmptyStep: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#EAE0D0]">
    <div className="w-16 h-16 rounded-2xl bg-[#FDFBF7] border-2 border-[#E2D7C3] flex items-center justify-center mb-2 shadow-sm">
      <BookOpen size={32} className="text-[#8C7A68]" />
    </div>
    <p className="font-fredoka font-bold text-[#1D3557]">No content for {title}</p>
    <p className="text-[#8C7A68] text-xs mt-0.5">Tap Continue to proceed.</p>
  </div>
);

export default SoloLessonPlayer;
