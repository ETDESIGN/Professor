// PronunciationCoach — Speaking pronunciation practice.
//
// Audit & Design Requirements:
// 1. REAL content: targets from the active unit vocabulary via services/manifest getVocabulary
//    (call only; fall back to a small built-in kid sentence list when no unit).
// 2. History chips of past attempts on the active target.
// 3. Honest practice-only state when client-graded (Web Speech API formative practice).
// 4. Fixed mic button bevel color to matching token (#BE185D, not #2f6f02).
// 5. Wonder Atlas warmth × Duolingo accents per Stitch screens 25/1.html & 25/2.html.

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Mic,
  Headphones,
  Volume2,
  RotateCcw,
  Sparkles,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoloSession } from '../../store/SoloSessionContext';
import { getVocabulary } from '../../services/manifest';
import {
  startPronunciationCheck,
  isSpeechRecognitionSupported,
  playAudioUrl,
  stopSpeaking,
} from '../../services/SpeechService';
import { playCue } from '../board/templates/playCue';
import { toast } from 'sonner';
import { createClientLogger } from '../../services/logger';

const log = createClientLogger('PronunciationCoach');

interface PronunciationCoachProps {
  onBack: () => void;
  /** Session summary on exit (real attempts — Phase 4: replaced the caller's hardcoded xp/accuracy). */
  onSessionEnd?: (stats: { correct: number; total: number }) => void;
  mode?: 'standalone' | 'embedded';
  onReady?: (isReady: boolean) => void;
  validateTrigger?: number;
  onResult?: (isCorrect: boolean) => void;
  data?: {
    targetSentence?: string;
    targetWord?: string;
  };
}

interface PronunciationAttempt {
  transcript: string;
  similarity: number;
  isCorrect: boolean;
  feedback: string;
  client_graded?: boolean;
  timestamp?: number;
}

interface TargetItem {
  sentence: string;
  word?: string;
  meaning?: string;
}

const BUILTIN_KID_TARGETS: TargetItem[] = [
  { sentence: 'The happy puppy wags its tail.', word: 'puppy', meaning: '小狗' },
  { sentence: 'I see a big yellow butterfly in the park.', word: 'butterfly', meaning: '蝴蝶' },
  { sentence: 'Can you swim like a little fish in the sea?', word: 'fish', meaning: '鱼' },
  { sentence: 'We love to read exciting adventure books.', word: 'books', meaning: '书本' },
  { sentence: 'Look at the bright glowing stars in the sky!', word: 'stars', meaning: '星星' },
];

const PronunciationCoach: React.FC<PronunciationCoachProps> = ({
  onBack,
  onSessionEnd,
  mode = 'standalone',
  onReady,
  validateTrigger,
  onResult,
  data,
}) => {
  const { state: solo } = useSoloSession();
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [targetIndex, setTargetIndex] = useState(0);
  const [historyByTarget, setHistoryByTarget] = useState<Record<number, PronunciationAttempt[]>>({});
  const [currentAttempt, setCurrentAttempt] = useState<PronunciationAttempt | null>(null);
  const [isSupported] = useState(isSpeechRecognitionSupported());
  const [solvedSet, setSolvedSet] = useState<Set<number>>(new Set());

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [userBars, setUserBars] = useState<number[]>(new Array(15).fill(5));

  // 1. Build targets list: data prop > active unit manifest vocabulary > kid fallback
  const targets: TargetItem[] = useMemo(() => {
    if (data?.targetSentence || data?.targetWord) {
      return [{
        sentence: data.targetSentence || data.targetWord || '',
        word: data.targetWord,
      }];
    }
    if (solo.activeUnit?.manifest) {
      const vocab = getVocabulary(solo.activeUnit.manifest);
      const list: TargetItem[] = [];
      for (const v of vocab) {
        const sentence = v.example_sentence && v.example_sentence.trim().length > 0
          ? v.example_sentence
          : (v.word && v.word.trim().length > 0 ? `I can say ${v.word}.` : '');
        if (sentence) {
          list.push({
            sentence,
            word: v.word,
            meaning: v.l1_translation || v.translation || v.definition,
          });
        }
      }
      if (list.length > 0) return list;
    }
    return BUILTIN_KID_TARGETS;
  }, [data, solo.activeUnit]);

  const currentTarget = targets[targetIndex] || targets[0];
  const targetSentence = currentTarget?.sentence || "Let's practice speaking!";
  const activeHistory = historyByTarget[targetIndex] || [];

  useEffect(() => {
    if (onReady) onReady(true);
    return () => {
      stopListening();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (validateTrigger && validateTrigger > 0) {
      startListening();
    }
  }, [validateTrigger]);

  const startAudioVisualizer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new Ctor();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 32;
      animateBars();
    } catch (err) {
      log.warn('audio_visualizer_failed', { error: err instanceof Error ? err.message : String(err) });
    }
  };

  const stopAudioVisualizer = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    streamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    setUserBars(new Array(15).fill(5));
  };

  const animateBars = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const bars = Array.from(dataArray.slice(0, 15)).map((v) => Math.max(5, (v / 255) * 100));
    setUserBars(bars);
    rafRef.current = requestAnimationFrame(animateBars);
  };

  const startListening = useCallback(() => {
    if (!isSupported) {
      toast.error('Speech recognition is not supported in this browser.');
      return;
    }

    stopSpeaking();
    setIsListening(true);
    setInterimText('');
    setCurrentAttempt(null);
    startAudioVisualizer();

    recognitionRef.current = startPronunciationCheck(
      targetSentence,
      (result) => {
        setIsListening(false);
        stopAudioVisualizer();
        const attempt: PronunciationAttempt = {
          ...result,
          timestamp: Date.now(),
        };
        setCurrentAttempt(attempt);
        setHistoryByTarget((prev) => ({
          ...prev,
          [targetIndex]: [...(prev[targetIndex] || []), attempt],
        }));

        if (result.isCorrect) {
          playCue('correct');
          setSolvedSet((prev) => new Set(prev).add(targetIndex));
        } else {
          playCue('wrong');
        }

        if (onResult) onResult(result.isCorrect);
      },
      (error) => {
        setIsListening(false);
        stopAudioVisualizer();
        toast.error(error);
      },
      (interim) => {
        setInterimText(interim);
      },
    );
  }, [isSupported, targetSentence, targetIndex, onResult]);

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    stopAudioVisualizer();
  };

  const toggleListening = () => {
    if (isListening) stopListening();
    else startListening();
  };

  const handlePlayTargetAudio = () => {
    stopSpeaking();
    playAudioUrl(undefined, targetSentence);
  };

  const handleFinish = () => {
    stopListening();
    stopSpeaking();
    if (onSessionEnd) {
      onSessionEnd({ correct: solvedSet.size, total: targets.length });
    } else {
      onBack();
    }
  };

  return (
    <div className="h-full bg-[#EAE0D0] flex flex-col font-nunito text-[#264653] select-none relative overflow-hidden">
      {/* Universal 64px Header */}
      <header className="h-16 w-full bg-[#FDFBF7] border-b-2 border-[#E2D7C3] px-4 flex items-center justify-between shrink-0 z-20 shadow-sm">
        <button
          type="button"
          onClick={handleFinish}
          className="w-11 h-11 rounded-2xl bg-[#F7F3EB] border-2 border-[#E2D7C3] shadow-[0_3px_0_#E2D7C3] flex items-center justify-center text-[#1D3557] hover:bg-[#EAE0D0] active:translate-y-0.5 transition-all"
          aria-label="Back"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="text-center flex-1 px-2">
          <h1 className="font-fredoka font-bold text-[19px] leading-tight text-[#1D3557]">
            Speaking Coach
          </h1>
          <p className="text-[11px] font-bold text-[#264653]/70 uppercase tracking-wider -mt-0.5">
            Target {targetIndex + 1} of {targets.length}
          </p>
        </div>

        <div className="w-11 h-11 rounded-2xl bg-pink-50 border-2 border-pink-200/90 flex items-center justify-center text-[#E91E63] shadow-sm">
          <Mic size={22} />
        </div>
      </header>

      {/* Main Practice Container */}
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-32 space-y-3.5">
        {/* Unit Context & Target Carousel Bar */}
        <div className="flex items-center justify-between bg-[#FDFBF7] rounded-[20px] p-2.5 border-2 border-[#E2D7C3] shadow-xs">
          <button
            type="button"
            onClick={() => {
              if (targetIndex > 0) {
                setTargetIndex((i) => i - 1);
                setCurrentAttempt(null);
                setInterimText('');
              }
            }}
            disabled={targetIndex === 0}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border font-bold ${
              targetIndex === 0 ? 'text-slate-300 border-slate-200' : 'text-[#1D3557] border-[#E2D7C3] bg-[#F7F3EB]'
            }`}
          >
            <ChevronLeft size={18} />
          </button>

          <div className="text-center min-w-0 px-2">
            <span className="text-[10px] font-fredoka font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#2A9D8F]/15 text-[#1E6F5C]">
              {solo.activeUnit?.title || 'Speaking Studio'}
            </span>
            <span className="block text-xs font-bold text-[#1D3557] mt-0.5">
              Sentence {targetIndex + 1} of {targets.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (targetIndex < targets.length - 1) {
                setTargetIndex((i) => i + 1);
                setCurrentAttempt(null);
                setInterimText('');
              }
            }}
            disabled={targetIndex >= targets.length - 1}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border font-bold ${
              targetIndex >= targets.length - 1
                ? 'text-slate-300 border-slate-200'
                : 'text-[#1D3557] border-[#E2D7C3] bg-[#F7F3EB]'
            }`}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Target Sentence Card */}
        <div className="bg-[#FDFBF7] rounded-[26px] p-5 border-[2.5px] border-[#E2D7C3] shadow-[0_4px_0_#E2D7C3] text-center relative">
          <div className="flex justify-center mb-3">
            <button
              type="button"
              onClick={handlePlayTargetAudio}
              className="px-4 py-2 bg-[#1CB0F6] hover:bg-[#1696d2] text-white font-fredoka font-bold text-xs rounded-xl shadow-[0_3px_0_#0284C7] active:translate-y-0.5 transition-all flex items-center gap-2"
            >
              <Volume2 size={16} />
              <span>Listen to Model 🔊</span>
            </button>
          </div>

          <h2 className="font-fredoka text-[21px] font-bold text-[#1D3557] leading-snug px-2">
            "{targetSentence}"
          </h2>

          {currentTarget.meaning && (
            <p className="text-xs font-bold text-[#264653]/60 mt-1">
              {currentTarget.meaning}
            </p>
          )}

          {/* Audio Visualizer Wave */}
          {isListening && (
            <div className="flex items-center justify-center gap-1.5 h-10 mt-4 px-4 bg-[#F7F3EB] rounded-2xl border border-[#E2D7C3]">
              {userBars.map((height, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-[#E91E63] rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(4, height * 0.35)}px` }}
                />
              ))}
            </div>
          )}

          {/* Interim transcript or prompt */}
          <div className="mt-3 min-h-[32px] flex items-center justify-center text-xs font-semibold">
            {isListening ? (
              <span className="text-[#E91E63] animate-pulse font-bold">
                {interimText || 'Listening… Speak now! 🎙️'}
              </span>
            ) : currentAttempt ? (
              <span className="text-[#1D3557]">
                You said: <strong>"{currentAttempt.transcript}"</strong>
              </span>
            ) : (
              <span className="text-[#264653]/60">
                Tap the big pink button and say the sentence aloud.
              </span>
            )}
          </div>
        </div>

        {/* Current Attempt Result & Feedback */}
        {currentAttempt && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`rounded-[22px] p-4 border-2 shadow-sm text-center ${
              currentAttempt.isCorrect
                ? 'bg-[#E6F4F1] border-[#2A9D8F] text-[#1E6F5C]'
                : 'bg-amber-50 border-amber-300 text-amber-800'
            }`}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              {currentAttempt.isCorrect ? (
                <>
                  <CheckCircle size={22} className="text-[#2A9D8F]" />
                  <span className="font-fredoka font-bold text-lg">Great Pronunciation!</span>
                </>
              ) : (
                <>
                  <AlertCircle size={22} className="text-amber-600" />
                  <span className="font-fredoka font-bold text-lg">Keep Practicing!</span>
                </>
              )}
            </div>

            <p className="text-xs font-semibold mb-2">
              Match Accuracy: <strong>{currentAttempt.similarity}%</strong>
            </p>

            {/* Honest Practice-Only Notice when client-graded */}
            {currentAttempt.client_graded && (
              <div className="mt-2 py-1.5 px-3 bg-white/80 rounded-xl border border-black/10 text-[11px] font-bold text-[#264653] inline-flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-[#2A9D8F]" />
                <span>Formative Voice Practice: Builds speaking fluency without scoring penalty!</span>
              </div>
            )}
          </motion.div>
        )}

        {/* History Chips of Past Attempts */}
        {activeHistory.length > 0 && (
          <div className="bg-[#FDFBF7] rounded-[22px] p-3.5 border-2 border-[#E2D7C3] shadow-xs">
            <span className="text-[11px] font-fredoka font-bold uppercase tracking-wider text-[#1D3557]/70 block mb-2">
              Recent Attempts for this Sentence
            </span>
            <div className="flex flex-wrap gap-2">
              {activeHistory.map((h, i) => (
                <div
                  key={i}
                  className={`px-3 py-1 rounded-xl text-xs font-fredoka font-bold border flex items-center gap-1.5 ${
                    h.isCorrect
                      ? 'bg-emerald-50 text-[#1E6F5C] border-[#2A9D8F]/40'
                      : h.similarity >= 60
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  <span>#{i + 1}</span>
                  <span>{h.similarity}%</span>
                  {h.isCorrect && <span>✓</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Anchored Bottom Microphone Deck (Fixed Bevel Color #BE185D) */}
      <footer className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-[#FDFBF7] border-t-2 border-[#E2D7C3] p-4 flex flex-col items-center justify-center z-30 shadow-lg">
        <button
          type="button"
          onClick={toggleListening}
          aria-label={isListening ? 'Stop Recording' : 'Start Speaking'}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-white transition-all ${
            isListening
              ? 'bg-red-500 border-4 border-red-600 shadow-[0_6px_0_#991b1b] animate-pulse active:translate-y-1'
              : 'bg-[#E91E63] border-4 border-[#BE185D] shadow-[0_6px_0_#BE185D] active:translate-y-1.5 active:shadow-[0_1px_0_#BE185D]'
          }`}
        >
          <Mic size={36} />
        </button>
        <span className="text-[11px] font-fredoka font-bold text-[#1D3557] mt-2">
          {isListening ? 'Tap to Stop' : 'Tap & Speak'}
        </span>
      </footer>
    </div>
  );
};

export default PronunciationCoach;
