// BoardStoryQuest v3 — Active story comprehension game (PRACTICE / OUTPUT).
// Rebuilt from Stitch designs:
//   • stitch/20-story-quest/1-storybook.html (reading theater state)
//   • stitch/20-story-quest/2-choice.html (choice moment & prediction state)
//
// Key enhancements (fixing §3 F1-F10):
//   1. UNCROPPED story illustration (object-contain) in dedicated widescreen card (F1)
//   2. Structured speaker dialogue turns with character badges & active highlights (F2)
//   3. High-contrast choice cards with A/B/C/D letter badges (F3)
//   4. Full-bleed widescreen canvas with pl-40/lg:pl-48 clearance for BoardShell phase pill
//   5. Preserves owner's animated 📚 trophy celebration on completion and empty state
//   6. Full lifecycle, dual-write scoring, remote action handlers, and pool coordination verbatim.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, BookOpen, Check, ArrowRight, Sparkles, CheckCircle2, RotateCcw, Lightbulb, PlayCircle, Eye } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng, seededShuffle } from '../../../services/seededRandom';
import { useBoardPool } from '../useBoardPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import { getStory, getVocabulary, getCharacters } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';
import type { PoolItem, StoryComprehensionContent } from '../../../types/exercise';

interface StoryPanel {
  id: string;
  imageUrl: string;
  text: string;
  audioUrl?: string;
  speaker?: string;
}

interface DialogueLine {
  speaker: string;
  text: string;
}

const FALLBACK_COLORS = ['#38BDF8', '#FF2D78', '#10B981', '#F59E0B', '#A855F7', '#EC4899', '#00FFCC'];

/** Parses multi-speaker dialogue text into individual speaker turns */
function parseDialogueLines(
  rawText: string,
  defaultSpeaker?: string,
  characters: any[] = []
): DialogueLine[] {
  if (!rawText || !rawText.trim()) return [];
  const trimmed = rawText.trim();
  const knownNames = characters.map((c) => String(c.name || '').trim()).filter(Boolean);

  let rawChunks = trimmed.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);

  if (rawChunks.length <= 1) {
    let foundInline = false;
    if (knownNames.length > 0) {
      const namePattern = knownNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const inlineRegex = new RegExp(`(?:^|\\s+)(${namePattern})\\s*[:：]\\s*`, 'gi');
      const matches = Array.from(trimmed.matchAll(inlineRegex));
      if (matches.length > 1) {
        foundInline = true;
        rawChunks = [];
        const indices = matches.map((m) => m.index!);
        for (let i = 0; i < matches.length; i++) {
          const start = indices[i];
          const end = i + 1 < matches.length ? indices[i + 1] : trimmed.length;
          rawChunks.push(trimmed.slice(start, end).trim());
        }
      }
    }
    if (!foundInline) {
      const genericSpeakerRegex = /(?:^|\s+)([A-Za-z0-9\s_'-]{2,25})\s*[:：]\s*/g;
      const matches = Array.from(trimmed.matchAll(genericSpeakerRegex));
      if (matches.length > 1) {
        rawChunks = [];
        const indices = matches.map((m) => m.index!);
        for (let i = 0; i < matches.length; i++) {
          const start = indices[i];
          const end = i + 1 < matches.length ? indices[i + 1] : trimmed.length;
          rawChunks.push(trimmed.slice(start, end).trim());
        }
      } else {
        rawChunks = [trimmed];
      }
    }
  }

  return rawChunks.map((chunk, idx) => {
    const colonMatch = chunk.match(/^([^:：\r\n]{1,35})[:：]\s*(.+)$/s);
    if (colonMatch) {
      return {
        speaker: colonMatch[1].trim(),
        text: colonMatch[2].trim().replace(/^["“](.*)["”]$/s, '$1'),
      };
    }
    const bracketMatch = chunk.match(/^[\[\(]([A-Za-z0-9\s_'-]{1,30})[\]\)]\s*[:：]?\s*(.+)$/s);
    if (bracketMatch) {
      return {
        speaker: bracketMatch[1].trim(),
        text: bracketMatch[2].trim().replace(/^["“](.*)["”]$/s, '$1'),
      };
    }
    let fallbackSpeaker = defaultSpeaker || 'Narrator';
    if (rawChunks.length > 1 && characters.length > 0) {
      fallbackSpeaker = characters[idx % characters.length]?.name || fallbackSpeaker;
    }
    return {
      speaker: fallbackSpeaker,
      text: chunk.replace(/^["“](.*)["”]$/s, '$1'),
    };
  });
}

const BoardStoryQuest = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction, triggerConfetti } = useSession();
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const completeRef = useRef(false);

  const [currentPanelIdx, setCurrentPanelIdx] = useState(0);
  const [phase, setPhase] = useState<'reading' | 'prediction' | 'comprehension' | 'complete'>('reading');
  const [selectedPrediction, setSelectedPrediction] = useState<number | null>(null);
  const [selectedComprehension, setSelectedComprehension] = useState<number | null>(null);
  const [vocabTaps, setVocabTaps] = useState<Set<string>>(new Set());
  const [comprehensionIdx, setComprehensionIdx] = useState(0);
  const [lastAward, setLastAward] = useState(0);
  const [streak, setStreak] = useState(0);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [comprehensionStats, setComprehensionStats] = useState({ correct: 0, total: 0 });
  const [activeSpeakerTurn, setActiveSpeakerTurn] = useState(0);

  const turnId = state.currentTurnId;
  const unitId = state.activeUnit?.id || '';
  const roster = state.students?.map((s: any) => s.id).filter(Boolean) || [];

  // ── Story panels: relational manifest first, frozen data.pages fallback ──
  const relPages = useMemo(() => getStory(state.activeUnit?.manifest).pages || [], [state.activeUnit?.manifest]);
  const storyPanels: StoryPanel[] = useMemo(() => {
    const raw = (relPages.length > 0 ? relPages : data?.pages) || [];
    return raw.map((p: any, i: number) => ({
      id: String(p.id ?? i),
      imageUrl: p.imageUrl || p.image || p.image_url || p.image_url_book_crop || p.cropUrl || p.crop_url || '',
      text: p.text || '',
      audioUrl: p.audioUrl || p.audio_url,
      speaker: p.speaker || p.speaker_override_name || '',
    }));
  }, [relPages, data?.pages]);

  // ── Characters & color bindings ──
  const liveChars = useMemo(() => getCharacters(state.activeUnit?.manifest) || [], [state.activeUnit?.manifest]);
  const characters = useMemo(() => {
    if (Array.isArray(data?.characters) && data.characters.length > 0) return data.characters;
    if (liveChars.length > 0) return liveChars;
    const manifestChars = (state.activeUnit?.manifest as any)?.characters;
    if (Array.isArray(manifestChars) && manifestChars.length > 0) return manifestChars;
    return [];
  }, [data?.characters, liveChars, state.activeUnit?.manifest]);

  const getCharColor = useCallback((name?: string) => {
    if (!name) return '#38BDF8';
    const idx = characters.findIndex((c: any) => c.name?.toLowerCase() === name.toLowerCase());
    if (idx >= 0 && characters[idx]?.color) return characters[idx].color;
    return FALLBACK_COLORS[idx >= 0 ? idx % FALLBACK_COLORS.length : 0];
  }, [characters]);

  // ── Vocab overlay: highlight target vocabulary words ──
  const vocabByWord = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of getVocabulary(state.activeUnit?.manifest)) {
      if (v.word) m.set(v.word.toLowerCase(), v);
    }
    return m;
  }, [state.activeUnit?.manifest]);

  // Comprehension questions from pool
  const { items: comprehensionItems, loading } = useBoardPool({
    unitId,
    exerciseTypes: ['STORY_COMPREHENSION'],
    limit: 10,
  });

  const currentItem = storyPanels[currentPanelIdx];

  // Parse dialogue lines for the current panel
  const parsedLines = useMemo(() => {
    if (!currentItem) return [];
    return parseDialogueLines(currentItem.text, currentItem.speaker, characters);
  }, [currentItem, characters]);

  // Reset on new turn
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    completeRef.current = false;
    setCurrentPanelIdx(0);
    setActiveSpeakerTurn(0);
    setPhase('reading');
    setSelectedPrediction(null);
    setSelectedComprehension(null);
    setVocabTaps(new Set());
    setComprehensionIdx(0);
    setStreak(0);
    setEliminatedOptions([]);
    setRevealed(false);
    setComprehensionStats({ correct: 0, total: 0 });
  }, [turnId]);

  const completeGame = (broadcast = true) => {
    if (completeRef.current) return;
    completeRef.current = true;
    playCue('win');
    setPhase('complete');
    if (broadcast) triggerAction('SLIDE_COMPLETE', { forced: false });
  };

  // Remote controls listener
  useEffect(() => {
    if (!state.lastAction) return;
    const { type } = state.lastAction;

    if (type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      completeRef.current = false;
      setCurrentPanelIdx(0);
      setActiveSpeakerTurn(0);
      setPhase('reading');
      setSelectedPrediction(null);
      setSelectedComprehension(null);
      setVocabTaps(new Set());
      setComprehensionIdx(0);
      setStreak(0);
      setEliminatedOptions([]);
      setRevealed(false);
      setComprehensionStats({ correct: 0, total: 0 });
    } else if (type === 'NEXT_PANEL') {
      advanceToNext();
    } else if (type === 'REVEAL_HINT') {
      if (phase !== 'comprehension' || selectedComprehension !== null) return;
      const question = comprehensionItems[comprehensionIdx];
      if (!question) return;
      const content = question.content as StoryComprehensionContent;
      const idx = content.options.findIndex(
        (_, i) => i !== content.correct_index && !eliminatedOptions.includes(i)
      );
      if (idx >= 0) setEliminatedOptions((prev) => [...prev, idx]);
    } else if (type === 'MARK_CORRECT') {
      if (phase !== 'comprehension' || selectedComprehension !== null) return;
      const question = comprehensionItems[comprehensionIdx];
      if (!question) return;
      const content = question.content as StoryComprehensionContent;
      const difficulty = question.difficulty || 2;
      playCue('correct');
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak === 3 || nextStreak === 5) {
        playCue('streak');
        triggerConfetti();
      }
      setComprehensionStats((prev) => ({ correct: prev.correct + 1, total: prev.total + 1 }));
      setSelectedComprehension(content.correct_index);
      const picked = state.quickWheelWinner;
      if (picked && !awardedRef.current) {
        awardedRef.current = true;
        const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0, nextStreak);
        if (points > 0) addPoints(picked, points);
        logAttempt({
          state,
          picked,
          unitId,
          objectiveId: question.objective_id,
          exerciseType: 'STORY_COMPREHENSION',
          difficulty,
          correctness: 'correct',
          modality: 'receptive',
          pushToRemediation,
        });
      }
      setTimeout(() => {
        setComprehensionIdx((prev) => prev + 1);
        advanceToNext();
      }, 900);
    } else if (type === 'SLIDE_COMPLETE') {
      completeGame(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  const handleVocabTap = (word: string, audioUrl?: string) => {
    if (audioUrl) playAudioUrl(audioUrl).catch(() => {});
    setVocabTaps((prev) => new Set(prev).add(word));
  };

  // ── Prediction options: real content from the next panel ──
  const predictionOptions = useMemo(() => {
    const next = storyPanels[currentPanelIdx + 1];
    if (!next) return [];
    const distractors = storyPanels
      .filter((_, i) => i !== currentPanelIdx && i !== currentPanelIdx + 1)
      .slice(0, 2)
      .map((p) => p.text);
    const opts = [
      { text: next.text, correct: true },
      ...distractors.map((t) => ({ text: t, correct: false })),
    ];
    return seededShuffle(opts, makeRng(seedBase, currentPanelIdx, 'predict'));
  }, [currentPanelIdx, storyPanels, seedBase]);

  const handlePredictionSelect = (idx: number) => {
    if (!currentItem || phase !== 'prediction') return;
    setSelectedPrediction(idx);
    if (predictionOptions[idx]?.correct) playCue('correct');
    setTimeout(() => {
      const isEveryTwo = (currentPanelIdx + 1) % 2 === 0;
      if (isEveryTwo && comprehensionIdx < comprehensionItems.length) {
        setPhase('comprehension');
      } else {
        advanceToNext();
      }
    }, 900);
  };

  const handleComprehensionSelect = (idx: number) => {
    if (phase !== 'comprehension' || selectedComprehension !== null) return;
    const question = comprehensionItems[comprehensionIdx];
    if (!question) return;

    const content = question.content as StoryComprehensionContent;
    const correct = content.correct_index;
    const difficulty = question.difficulty || 2;

    setSelectedComprehension(idx);

    if (idx === correct) {
      playCue('correct');
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak === 3 || nextStreak === 5) {
        playCue('streak');
        triggerConfetti();
      }
      setComprehensionStats((prev) => ({ correct: prev.correct + 1, total: prev.total + 1 }));
      const picked = state.quickWheelWinner;
      const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0, nextStreak);
      if (picked && !awardedRef.current) {
        awardedRef.current = true;
        if (points > 0) addPoints(picked, points);
        logAttempt({
          state,
          picked,
          unitId,
          objectiveId: question.objective_id,
          exerciseType: 'STORY_COMPREHENSION',
          difficulty,
          correctness: 'correct',
          modality: 'receptive',
          pushToRemediation,
        });
      }
      setLastAward(points);
      setTimeout(() => {
        setComprehensionIdx((prev) => prev + 1);
        advanceToNext();
      }, 900);
    } else {
      playCue('wrong');
      setStreak(0);
      setComprehensionStats((prev) => ({ ...prev, total: prev.total + 1 }));
      mistakesRef.current += 1;
      const picked = state.quickWheelWinner;
      if (picked) addPoints(picked, -MISTAKE_PENALTY);
      logAttempt({
        state,
        picked: picked || '',
        unitId,
        objectiveId: question.objective_id,
        exerciseType: 'STORY_COMPREHENSION',
        difficulty,
        correctness: 'incorrect',
        correct: false,
        modality: 'receptive',
        pushToRemediation,
      });
      if (mistakesRef.current >= 2) {
        playCue('reveal');
        setRevealed(true);
        setTimeout(() => {
          setRevealed(false);
          setComprehensionIdx((prev) => prev + 1);
          advanceToNext();
        }, 2200);
      } else {
        setTimeout(() => setSelectedComprehension(null), 800);
      }
    }
  };

  const advanceToNext = () => {
    if (currentPanelIdx < storyPanels.length - 1) {
      mistakesRef.current = 0;
      awardedRef.current = false;
      setCurrentPanelIdx((prev) => prev + 1);
      setActiveSpeakerTurn(0);
      setPhase('reading');
      setSelectedPrediction(null);
      setSelectedComprehension(null);
      setEliminatedOptions([]);
      setRevealed(false);
    } else {
      completeGame();
    }
  };

  const playAudio = () => {
    if (currentItem?.audioUrl) {
      playAudioUrl(currentItem.audioUrl).catch(() => {});
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        playAudio();
      } else if (e.code === 'ArrowRight' || e.code === 'Enter') {
        if (phase === 'reading') {
          if (currentPanelIdx < storyPanels.length - 1 && predictionOptions.length > 0) {
            setPhase('prediction');
          } else {
            advanceToNext();
          }
        }
      } else if (e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key, 10) - 1;
        if (phase === 'prediction' && predictionOptions[idx]) {
          handlePredictionSelect(idx);
        } else if (phase === 'comprehension' && !eliminatedOptions.includes(idx)) {
          handleComprehensionSelect(idx);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, currentPanelIdx, predictionOptions, eliminatedOptions, playAudio]);

  // ── Render words with vocab highlights ──
  const renderTextWithVocab = (text: string) => {
    return text.split(/(\s+)/).map((rawWord, idx) => {
      const cleaned = rawWord.toLowerCase().replace(/[^\w']/g, '');
      const vocabWord = cleaned ? vocabByWord.get(cleaned) : undefined;
      if (vocabWord) {
        return (
          <button
            key={idx}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleVocabTap(vocabWord.word, vocabWord.audio_url);
            }}
            className={`inline-block mx-0.5 px-1.5 py-0.5 rounded font-bold transition-all ${
              vocabTaps.has(vocabWord.word)
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                : 'bg-amber-500/20 text-amber-300 border border-amber-400/40 hover:bg-amber-500/30'
            }`}
            title={vocabWord.translation || vocabWord.l1_translation || ''}
          >
            {rawWord}
          </button>
        );
      }
      return <span key={idx}>{rawWord}</span>;
    });
  };

  // Empty state: keeps owner's animated 📚 trophy
  if (!loading && storyPanels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#070C18] text-white p-8 text-center select-none">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          className="w-52 h-52 rounded-full bg-slate-900 shadow-2xl border-4 border-amber-500/40 flex items-center justify-center text-[6rem] leading-none mb-8 shadow-amber-500/10"
        >
          📚
        </motion.div>
        <h2 className="text-4xl font-black text-amber-400 mb-3 tracking-wide">Story Quest</h2>
        <div className="text-xl text-slate-400 max-w-xl">
          This unit has no story pages yet — skip to the next slide.
        </div>
      </div>
    );
  }

  if (loading || !currentItem) {
    return (
      <div className="flex items-center justify-center h-full bg-[#070C18] text-white">
        <div className="text-2xl text-slate-400 font-bold animate-pulse">Loading story…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#070C18] text-white overflow-hidden select-none font-sans relative sq-container">
      <style>{`
        .sq-grid {
          background-size: 40px 40px;
          background-image: 
            linear-gradient(to right, rgba(56, 189, 248, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(56, 189, 248, 0.04) 1px, transparent 1px);
        }
        .active-turn-glow {
          box-shadow: 0 0 24px -2px rgba(56, 189, 248, 0.35), inset 0 0 16px -4px rgba(56, 189, 248, 0.15);
        }
        .btn-primary-glow {
          box-shadow: 0 0 20px rgba(255, 45, 120, 0.5);
        }
        .btn-primary-glow:hover {
          box-shadow: 0 0 30px rgba(255, 45, 120, 0.85);
        }
        @media (max-height: 450px) {
          .sq-container { padding: 0.25rem 0.5rem !important; }
          .sq-header { height: 2.25rem !important; margin-bottom: 0.25rem !important; }
          .sq-main { gap: 0.5rem !important; }
          .sq-left { padding: 0.5rem !important; }
          .sq-right { padding: 0.5rem !important; }
          .sq-turn-card { padding: 0.35rem 0.5rem !important; }
          .sq-chant { font-size: 1.1rem !important; line-height: 1.25 !important; }
          .sq-dot { width: 1.25rem !important; height: 1.25rem !important; font-size: 0.65rem !important; }
        }
      `}</style>

      {/* Top Header — pl-40 lg:pl-48 clearance for BoardShell phase pill */}
      <header className="h-14 sm:h-16 w-full flex-shrink-0 flex items-center justify-between pl-40 lg:pl-48 pr-6 border-b border-slate-800 bg-[#070C18]/90 backdrop-blur-md z-30 sq-header">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FF2D78]/20 border border-[#FF2D78]/50 flex items-center justify-center text-[#FF2D78] font-black text-lg">
            Q
          </div>
          <div>
            <h1 className="font-bold text-lg sm:text-xl tracking-wide text-white">
              Story Quest <span className="text-slate-400 font-normal text-xs sm:text-sm ml-1">· Chapter {currentPanelIdx + 1}</span>
            </h1>
          </div>
        </div>

        {/* Right Status Meta */}
        <div className="flex items-center gap-3">
          {pickedStudent ? (
            <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900 border border-amber-400/50 text-amber-300 text-xs font-bold shadow-sm">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>{pickedStudent.name}'s Turn</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-emerald-400/40 text-emerald-300 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Whole Class</span>
            </div>
          )}
          <span className="text-slate-400 text-xs uppercase tracking-wider bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800 font-mono">
            Page {currentPanelIdx + 1}/{storyPanels.length}
          </span>
        </div>
      </header>

      {/* Main Stage */}
      <AnimatePresence>
        {/* ═══ 1. READING THEATER PHASE ═══ */}
        {phase === 'reading' && (
          <motion.main
            key={`reading-${currentPanelIdx}`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex-1 w-full p-4 sm:p-6 grid grid-cols-12 gap-4 sm:gap-6 min-h-0 sq-main"
          >
            {/* Left 40% (5 Cols): Dialogue Script with Speaker Turns */}
            <section className="col-span-5 flex flex-col bg-[#0B132B] rounded-2xl border border-slate-800 p-4 sm:p-6 min-h-0 justify-between shadow-2xl sq-left">
              {/* Script Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" />
                  <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 font-mono">
                    SCENE {String(currentPanelIdx + 1).padStart(2, '0')} · DIALOGUE SCRIPT
                  </h2>
                </div>
                {currentItem.audioUrl && (
                  <button
                    onClick={playAudio}
                    className="flex items-center gap-1.5 text-[#38BDF8] hover:text-sky-300 text-xs font-bold px-2.5 py-1 rounded bg-[#111C3D] border border-sky-400/30 transition-all active:scale-95"
                  >
                    <Volume2 size={14} /> Replay
                  </button>
                )}
              </div>

              {/* Dialogue Turns Feed */}
              <div className="flex-1 flex flex-col justify-center gap-3 py-3 min-h-0 overflow-y-auto">
                {parsedLines.map((line, idx) => {
                  const isActive = idx === activeSpeakerTurn;
                  const isPast = idx < activeSpeakerTurn;
                  const charColor = getCharColor(line.speaker);

                  return (
                    <article
                      key={idx}
                      onClick={() => setActiveSpeakerTurn(idx)}
                      className={`rounded-xl p-3.5 sm:p-4 transition-all duration-200 cursor-pointer sq-turn-card ${
                        isActive
                          ? 'active-turn-glow bg-[#111C3D] border-2 border-[#38BDF8] shadow-lg scale-[1.01]'
                          : isPast
                          ? 'opacity-50 bg-[#090F21] border border-slate-800/60'
                          : 'opacity-40 bg-[#090F21] border border-slate-800/60 hover:opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase border"
                            style={{
                              backgroundColor: `${charColor}20`,
                              color: charColor,
                              borderColor: `${charColor}50`,
                            }}
                          >
                            {line.speaker}
                          </span>
                          {isActive && (
                            <span className="text-[10px] text-[#38BDF8] font-bold uppercase tracking-wide flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] animate-pulse" /> Speaking Now
                            </span>
                          )}
                        </div>
                        {isPast && <CheckCircle2 size={16} className="text-emerald-400" />}
                      </div>

                      <div className={`font-bold leading-tight ${isActive ? 'text-xl sm:text-2xl text-white sq-chant' : 'text-sm sm:text-base text-slate-300'}`}>
                        “{renderTextWithVocab(line.text)}”
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Action Buttons Row */}
              <div className="pt-3 border-t border-slate-800 flex items-center gap-3">
                {currentPanelIdx < storyPanels.length - 1 && predictionOptions.length > 0 ? (
                  <button
                    onClick={() => setPhase('prediction')}
                    className="flex-1 py-3 sm:py-3.5 px-4 rounded-xl bg-[#FF2D78] text-white font-bold text-base sm:text-lg tracking-wide btn-primary-glow hover:bg-[#FF2D78]/90 transition-all duration-200 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>What happens next?</span>
                    <ArrowRight size={20} />
                  </button>
                ) : (
                  <button
                    onClick={() => advanceToNext()}
                    className="flex-1 py-3 sm:py-3.5 px-4 rounded-xl bg-[#FF2D78] text-white font-bold text-base sm:text-lg tracking-wide btn-primary-glow hover:bg-[#FF2D78]/90 transition-all duration-200 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>Continue Story</span>
                    <ArrowRight size={20} />
                  </button>
                )}

                {currentItem.audioUrl && (
                  <button
                    onClick={playAudio}
                    className="py-3 sm:py-3.5 px-4 rounded-xl bg-[#111C3D] hover:bg-[#182652] text-white font-bold text-xs sm:text-sm border border-slate-700 hover:border-[#38BDF8] transition-all flex items-center gap-2"
                    title="Replay Audio (Space)"
                  >
                    <Volume2 size={18} />
                    <span className="hidden sm:inline">Listen</span>
                  </button>
                )}
              </div>
            </section>

            {/* Right 60% (7 Cols): Uncropped Artwork with Story Progress Strip */}
            <section className="col-span-7 flex flex-col bg-[#0B132B] rounded-2xl border border-slate-800 p-4 sm:p-6 min-h-0 justify-between shadow-2xl sq-right">
              {/* Scene Info */}
              <div className="flex items-center justify-between pb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#111C3D] border border-slate-800 text-xs font-bold text-[#38BDF8] tracking-wider uppercase font-mono">
                  SCENE {String(currentPanelIdx + 1).padStart(2, '0')} · {currentItem.speaker ? currentItem.speaker.toUpperCase() : 'STORY'}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Page {currentPanelIdx + 1} of {storyPanels.length}
                </span>
              </div>

              {/* Uncropped Full Illustration Container (object-contain, solving F1) */}
              <div className="flex-1 w-full bg-[#050812] rounded-xl border border-slate-800 relative flex items-center justify-center overflow-hidden p-2 min-h-0 shadow-inner">
                {currentItem.imageUrl ? (
                  <img
                    src={currentItem.imageUrl}
                    alt="Story scene"
                    className="w-full h-full object-contain rounded-lg drop-shadow-md"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500">
                    <BookOpen size={48} className="text-slate-600 mb-2" />
                    <span className="text-sm font-bold">Story Illustration</span>
                  </div>
                )}
              </div>

              {/* Bottom Metadata: Chunky Progress Dots + Teacher Cue */}
              <div className="pt-3 flex flex-col gap-2.5">
                {/* Progress Strip */}
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#090F21] border border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider text-slate-400 font-bold font-mono">Story Path:</span>
                    <div className="flex items-center gap-1.5">
                      {storyPanels.map((_, idx) => {
                        const isDone = idx < currentPanelIdx;
                        const isCurrent = idx === currentPanelIdx;
                        return (
                          <div key={idx} className="flex items-center gap-1.5">
                            <div
                              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-bold text-xs transition-all sq-dot ${
                                isDone
                                  ? 'bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400'
                                  : isCurrent
                                  ? 'bg-[#FF2D78]/20 border-2 border-[#FF2D78] text-[#FF2D78] shadow-[0_0_12px_rgba(255,45,120,0.8)] scale-110'
                                  : 'border-2 border-slate-800 text-slate-600'
                              }`}
                            >
                              {isDone ? <Check size={13} strokeWidth={3} /> : idx + 1}
                            </div>
                            {idx < storyPanels.length - 1 && (
                              <div className={`w-3 sm:w-4 h-0.5 ${isDone ? 'bg-emerald-500/60' : 'bg-slate-800'}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">16:9 Classroom Stage</span>
                </div>

                {/* Teacher Prompt Cue */}
                <div className="px-3.5 py-2 rounded-xl bg-[#111C3D]/80 border border-amber-400/30 flex items-center gap-2.5 text-xs">
                  <Lightbulb size={16} className="text-amber-400 shrink-0" />
                  <p className="text-slate-300 truncate">
                    <strong className="text-amber-300">Teacher Cue:</strong> Ask students to read aloud together, then tap vocab words to hear pronunciation!
                  </p>
                </div>
              </div>
            </section>
          </motion.main>
        )}

        {/* ═══ 2. PREDICTION GATE (per 2-choice.html) ═══ */}
        {phase === 'prediction' && predictionOptions.length > 0 && (
          <motion.main
            key={`prediction-${currentPanelIdx}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 flex flex-col justify-center gap-4 sm:gap-6 min-h-0"
          >
            {/* Top Prompt Card */}
            <section className="bg-[#0B132B] border border-slate-800 rounded-2xl p-5 shadow-2xl text-center">
              <span className="px-3 py-1 rounded-full bg-[#00FFCC]/10 border border-[#00FFCC]/30 text-[#00FFCC] text-xs font-bold uppercase tracking-widest">
                Whole Class Prediction
              </span>
              <h2 className="text-2xl sm:text-4xl font-black text-white mt-2 tracking-tight">
                What happens next?
              </h2>
              <p className="text-slate-400 text-sm mt-1">Guess what happens in the next scene!</p>
            </section>

            {/* Prediction Options Grid */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 items-stretch">
              {predictionOptions.map((option, idx) => {
                const labels = ['A', 'B', 'C'];
                const isSelected = selectedPrediction === idx;
                return (
                  <motion.button
                    key={idx}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePredictionSelect(idx)}
                    className={`flex flex-col justify-between p-5 rounded-2xl border-2 text-left transition-all duration-200 shadow-xl min-h-[140px] sm:min-h-[180px] ${
                      isSelected
                        ? option.correct
                          ? 'bg-emerald-600 border-emerald-400 text-white shadow-emerald-950/50'
                          : 'bg-amber-600 border-amber-400 text-white shadow-amber-950/50'
                        : 'bg-[#0B132B] border-slate-800 hover:border-[#38BDF8] text-slate-100 hover:bg-[#111C3D]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center font-bold text-base text-[#38BDF8] border border-slate-700">
                        {labels[idx] || idx + 1}
                      </div>
                      <span className="text-xs uppercase tracking-wider font-mono text-slate-400">
                        Option {idx + 1}
                      </span>
                    </div>

                    <p className="text-base sm:text-xl font-bold leading-snug flex-1 flex items-center">
                      “{option.text}”
                    </p>
                  </motion.button>
                );
              })}
            </section>

            {selectedPrediction !== null && (
              <div className="text-center text-lg font-bold">
                {predictionOptions[selectedPrediction]?.correct ? (
                  <span className="text-emerald-400">Great prediction! 🎯 Advancing to story…</span>
                ) : (
                  <span className="text-amber-400">Interesting guess! Let's find out! →</span>
                )}
              </div>
            )}
          </motion.main>
        )}

        {/* ═══ 3. COMPREHENSION CHECK (MCQ per 2-choice.html) ═══ */}
        {phase === 'comprehension' && comprehensionItems[comprehensionIdx] && (
          <motion.main
            key={`comprehension-${comprehensionIdx}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 flex flex-col justify-center gap-4 sm:gap-6 min-h-0"
          >
            {/* Question Card */}
            <section className="bg-[#0B132B] border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl relative overflow-hidden text-center">
              <div className="flex items-center justify-between mb-2">
                <span className="px-3 py-1 rounded-full bg-[#38BDF8]/10 border border-[#38BDF8]/40 text-[#38BDF8] text-xs font-bold uppercase tracking-widest font-mono">
                  Comprehension Check · Question {comprehensionIdx + 1}/{comprehensionItems.length}
                </span>
                {streak > 0 && (
                  <span className="text-xs text-amber-400 font-bold uppercase tracking-wide">
                    🔥 Streak: {streak}
                  </span>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                {(comprehensionItems[comprehensionIdx].content as StoryComprehensionContent).prompt}
              </h2>
            </section>

            {/* Options Grid (2x2 or horizontal) */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {(comprehensionItems[comprehensionIdx].content as StoryComprehensionContent).options.map((option, idx) => {
                const labels = ['A', 'B', 'C', 'D'];
                const isEliminated = eliminatedOptions.includes(idx);
                const isCorrectIdx =
                  idx === (comprehensionItems[comprehensionIdx].content as StoryComprehensionContent).correct_index;
                const isSelected = selectedComprehension === idx;

                return (
                  <motion.button
                    key={idx}
                    whileHover={{ scale: isEliminated ? 1 : 1.02 }}
                    whileTap={{ scale: isEliminated ? 1 : 0.98 }}
                    onClick={() => !isEliminated && handleComprehensionSelect(idx)}
                    disabled={isEliminated}
                    className={`flex items-center gap-3 p-4 sm:p-5 rounded-2xl border-2 text-left transition-all duration-200 shadow-lg ${
                      isEliminated
                        ? 'opacity-30 line-through bg-slate-950 border-slate-900 text-slate-500 cursor-not-allowed'
                        : isSelected
                        ? isCorrectIdx
                          ? 'bg-emerald-600 border-emerald-400 text-white'
                          : 'bg-rose-600 border-rose-400 text-white'
                        : 'bg-[#0B132B] border-slate-800 hover:border-[#38BDF8] text-white hover:bg-[#111C3D]'
                    } ${revealed && isCorrectIdx ? 'ring-4 ring-amber-400 border-amber-400 bg-amber-950/40' : ''}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center font-bold text-base text-[#38BDF8] border border-slate-700 shrink-0">
                      {labels[idx] || idx + 1}
                    </div>
                    <span className="text-base sm:text-xl font-bold flex-1">{option}</span>
                  </motion.button>
                );
              })}
            </section>

            {/* Explanation Note on 2nd Miss */}
            {revealed && (comprehensionItems[comprehensionIdx].content as any).explanation && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-amber-950/70 border-2 border-amber-400/80 rounded-xl text-center text-sm text-amber-200"
              >
                {(comprehensionItems[comprehensionIdx].content as any).explanation}
              </motion.div>
            )}
          </motion.main>
        )}

        {/* ═══ 4. TERMINAL CELEBRATION (keeps owner's animated 📚 trophy) ═══ */}
        {phase === 'complete' && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex items-center justify-center p-8 select-none"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                className="text-[11rem] leading-none mb-8 drop-shadow-[0_12px_24px_rgba(234,88,12,0.25)]"
              >
                📚
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-6xl font-bold text-orange-400 mb-4"
              >
                Story Complete!
              </motion.h2>
              <div className="text-2xl text-slate-300 mb-2">{storyPanels.length} pages read</div>
              {comprehensionStats.total > 0 && (
                <div className="text-2xl text-emerald-400 font-semibold">
                  Comprehension: {comprehensionStats.correct}/{comprehensionStats.total} correct
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BoardStoryQuest;
