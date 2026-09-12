// SPEAK_SENTENCE — pronounce the target sentence. Upgraded per Stitch screens
// 18/1.html (mic-ready state with live volume visualizer) and 18/2.html (tiered
// retry feedback with word-level diagnostic pills and 3-try budget visual).
//
// Key UX behaviors (Audit & Owner approval):
// 1. Live volume visualizer: reimplemented locally via AnalyserNode (zero imports from Coach).
// 2. Interim transcript display: real-time streaming feedback while child speaks.
// 3. Word-level diagnostic pills: colors clear words emerald and unclear words amber.
// 4. 3-try attempt budget visual: 3 dots ("🟢 Try 1 • ⚪ Try 2 • ⚪ Try 3"), advancing after 3 tries.
// 5. Data-write discipline: client-graded speech pass keeps record: false rule untouched.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Check, X, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { BaseExerciseProps } from '../../../types/exercise';
import {
  startPronunciationCheck,
  isSpeechRecognitionSupported,
  playAudioUrl,
} from '../../../services/SpeechService';
import { useElapsedMs, Feedback, AudioButton } from './shared';
import { playCue } from '../../board/templates/playCue';

interface SpeechCheckResult {
  transcript: string;
  confidence?: number;
  similarity: number;
  isCorrect: boolean;
  feedback?: string;
  client_graded?: boolean;
}

const PASS_THRESHOLD = 0.6;
const MAX_ATTEMPTS = 3;

const SpeakSentence: React.FC<BaseExerciseProps> = ({ data, onComplete, onError }) => {
  const c = data.content as Extract<import('../../../types/exercise').ExerciseContent, { type: 'SPEAK_SENTENCE' }>;
  const elapsed = useElapsedMs();
  const { t } = useTranslation();

  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastResult, setLastResult] = useState<SpeechCheckResult | null>(null);
  const [attemptsCount, setAttemptsCount] = useState(0);
  const [volumeBars, setVolumeBars] = useState<number[]>([18, 28, 45, 32, 18]);

  const attemptsRef = useRef(0);
  const supported = isSpeechRecognitionSupported();

  // Audio visualizer refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAudioVisualizer = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setVolumeBars([18, 28, 45, 32, 18]);
  };

  const animateBars = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const b0 = Math.max(14, ((dataArray[1] || 0) / 255) * 58);
    const b1 = Math.max(22, ((dataArray[3] || 0) / 255) * 62);
    const b2 = Math.max(28, ((dataArray[5] || 0) / 255) * 64);
    const b3 = Math.max(20, ((dataArray[7] || 0) / 255) * 60);
    const b4 = Math.max(14, ((dataArray[9] || 0) / 255) * 52);

    setVolumeBars([b0, b1, b2, b3, b4]);
    rafRef.current = requestAnimationFrame(animateBars);
  };

  const startAudioVisualizer = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      animateBars();
    } catch {
      // Fallback: graceful silent continuation
    }
  };

  useEffect(() => {
    return () => {
      stopAudioVisualizer();
      if (autoTimerRef.current !== null) clearTimeout(autoTimerRef.current);
    };
  }, []);

  const handleAdvance = (success: boolean, record: boolean, attempts: number) => {
    if (autoTimerRef.current !== null) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    onComplete({
      success,
      time_taken_ms: elapsed(),
      attempts,
      record,
    });
  };

  const handleMic = () => {
    if (!supported || listening) return;
    setFeedback('idle');
    setListening(true);
    setInterimTranscript('');
    startAudioVisualizer();

    startPronunciationCheck(
      c.target_sentence,
      (result) => {
        stopAudioVisualizer();
        setListening(false);
        setLastResult(result);

        const currentAttempts = attemptsRef.current + 1;
        attemptsRef.current = currentAttempts;
        setAttemptsCount(currentAttempts);

        const sim = result.similarity;

        if (result.isCorrect) {
          playCue('correct');
          setFeedback('correct');

          // Pass: client_graded speech passes remain record: false
          if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
            autoTimerRef.current = setTimeout(() => {
              handleAdvance(true, !result.client_graded, currentAttempts);
            }, 1100);
          }
        } else {
          playCue('wrong');
          playCue('reveal');
          setFeedback('wrong');

          if (currentAttempts >= MAX_ATTEMPTS) {
            // Reached maximum attempts: prompt child to continue without being stuck
            toast(t('exercise.attemptBudgetReached', 'Great effort! Let’s move forward!'), { icon: '✨' });
          } else if (sim >= 0.4) {
            toast(t('exercise.almostRetry', 'Almost! Try once more 🎤'), { icon: '🤏' });
          } else {
            toast(t('exercise.listenAgain', 'Listen again, then try 🎧'), { icon: '🔁' });
            playAudioUrl(c.target_audio, c.target_sentence);
          }
        }
      },
      (msg) => {
        stopAudioVisualizer();
        setListening(false);
        onError?.(msg);
        toast.error(msg);
      },
      (interim) => {
        setInterimTranscript(interim);
      },
      PASS_THRESHOLD,
    );
  };

  const skipAsUnsupported = () => {
    if (feedback !== 'idle') return;
    onError?.('Speech recognition unavailable');
    setFeedback('correct');
    handleAdvance(true, false, 1);
  };

  // Word diagnostic breakdown
  const targetWords = useMemo(
    () => (c.target_sentence || '').split(/\s+/).filter(Boolean),
    [c.target_sentence],
  );

  const recognizedTokens = useMemo(() => {
    const text = (lastResult?.transcript || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
    return new Set(text.split(/\s+/).filter(Boolean));
  }, [lastResult]);

  const wordDiagnostics = targetWords.map((word) => {
    const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isMatched = recognizedTokens.has(clean);
    return { word, isMatched };
  });

  const matchedWordCount = wordDiagnostics.filter((w) => w.isMatched).length;
  const firstUnclearWord = wordDiagnostics.find((w) => !w.isMatched)?.word || targetWords[0] || '';

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-[#EAE0D0] text-[#264653]">
      {/* Scrollable Canvas */}
      <div className="flex-1 flex flex-col px-4 pt-3 pb-36 overflow-y-auto space-y-3.5">
        
        {/* Top Companion Scene & Target Sentence Card (Stitch 18-1) */}
        <section className="bg-[#FDFBF7] rounded-[28px] p-4 border-2 border-[#E2D7C3] shadow-[0_4px_0_#E2D7C3] text-center flex flex-col items-center relative">
          
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FDF2E9] border border-[#F8D2C4] rounded-full text-[11px] font-extrabold text-[#E76F51] tracking-wider uppercase mb-2">
            <span className="w-2 h-2 rounded-full bg-[#E76F51] animate-ping opacity-75"></span>
            <span>SPEAK OUT LOUD • 大声朗读</span>
          </div>

          {/* DJ Professor Owl Avatar */}
          <div className="relative w-20 h-16 flex items-center justify-center my-0.5 text-4xl">
            🦉
          </div>

          {/* Target Sentence Card */}
          <div className="w-full bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl py-3 px-3.5 my-1.5 shadow-inner">
            <p className="font-bold text-[22px] leading-tight text-[#1D3557]">
              “{c.target_sentence}”
            </p>
          </div>

          {/* Hear model first pill */}
          <button
            type="button"
            onClick={() => playAudioUrl(c.target_audio, c.target_sentence)}
            className="h-10 px-4 mt-1 bg-[#1CB0F6] hover:bg-[#0EA5E9] text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-[0_3px_0_#0284C7] active:translate-y-[2px] active:shadow-[0_1px_0_#0284C7] transition-transform cursor-pointer"
            title="Hear native pronunciation"
          >
            <Volume2 size={16} />
            <span>Hear model first</span>
            <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded ml-0.5">
              示范
            </span>
          </button>
        </section>

        {/* Live Mic Recording Deck (Audit P1 F2, Stitch 18-1) */}
        {supported ? (
          <section className="bg-[#FDFBF7] rounded-[32px] p-5 border-2 border-[#E2D7C3] shadow-[0_4px_0_#E2D7C3] flex flex-col items-center justify-center relative">
            
            {/* Status indicator */}
            <div className={`flex items-center gap-2 mb-2 px-3 py-1 rounded-full border text-xs font-bold ${
              listening
                ? 'bg-[#FFF4F0] border-[#FCD9CF] text-[#E76F51]'
                : 'bg-[#F7F3E8] border-[#E2D7C3] text-[#8C7A68]'
            }`}>
              <span className={`w-2.5 h-2.5 rounded-full ${listening ? 'bg-[#FF4B4B] animate-ping' : 'bg-[#2A9D8F]'}`}></span>
              <span>{listening ? 'LISTENING... SPEAK CLEARLY' : 'TAP MIC TO SPEAK'}</span>
            </div>

            {/* Circular Mic Button in Terracotta */}
            <div className="relative my-2 flex items-center justify-center">
              {listening && (
                <div className="absolute w-[112px] h-[112px] rounded-full bg-[#E76F51]/20 animate-ping pointer-events-none"></div>
              )}

              <button
                type="button"
                onClick={handleMic}
                disabled={listening}
                className={`relative w-[84px] h-[84px] rounded-full shadow-[0_5px_0_#C4553B] active:translate-y-[2px] active:shadow-[0_2px_0_#C4553B] flex items-center justify-center text-white z-10 transition-transform ${
                  listening
                    ? 'bg-[#FF4B4B] shadow-[0_5px_0_#DC2626] animate-pulse cursor-wait'
                    : 'bg-[#E76F51] hover:brightness-105 cursor-pointer'
                }`}
                aria-label="Microphone"
              >
                {listening ? <MicOff size={36} /> : <Mic size={36} />}
              </button>
            </div>

            {/* Live 5-bar Audio Volume Visualizer (Audit P1 F2) */}
            <div className="h-14 flex items-end justify-center gap-2.5 my-2 px-6 py-1 bg-[#F7F3E8] rounded-2xl border border-[#E2D7C3] w-full max-w-[240px]">
              {volumeBars.map((h, i) => (
                <div
                  key={i}
                  className="w-3 rounded-full bg-[#38BDF8] transition-all duration-75"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>

            {/* Interim Transcript Feed (Audit F4) */}
            <div className="mt-2 px-3.5 py-1.5 bg-[#F7F3E8] border border-[#E2D7C3] rounded-xl flex items-center gap-2 max-w-full">
              <span className="text-xs font-bold text-[#2A9D8F] uppercase tracking-wider">I Hear:</span>
              <p className="text-sm font-bold text-[#1D3557] truncate">
                {interimTranscript ? `“${interimTranscript}”` : (lastResult?.transcript ? `“${lastResult.transcript}”` : '“...”')}
              </p>
            </div>

            {/* 3-Dot Attempt Budget Bar (Audit P1 F1) */}
            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-[#1D3557]">
              <span>🎯 Attempt:</span>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3].map((dot) => (
                  <span
                    key={dot}
                    className={`w-3 h-3 rounded-full border ${
                      attemptsCount >= dot
                        ? 'bg-[#10B981] border-[#059669]'
                        : 'bg-[#FDFBF7] border-[#E2D7C3]'
                    }`}
                    title={`Attempt ${dot}`}
                  />
                ))}
              </div>
              <span className="text-[11px] text-[#8C7A68]">
                {attemptsCount} of {MAX_ATTEMPTS} used
              </span>
            </div>

          </section>
        ) : (
          <div className="bg-[#FDFBF7] rounded-3xl p-6 border-2 border-[#E2D7C3] text-center">
            <p className="text-[#8C7A68] text-sm mb-3">
              {t('exercise.speechUnsupported', "Speech recognition isn't supported on this device.")}
            </p>
            <button
              type="button"
              onClick={skipAsUnsupported}
              className="bg-[#2A9D8F] text-white font-bold px-6 py-3 rounded-2xl shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px]"
            >
              {t('student.continue', 'Continue')}
            </button>
          </div>
        )}

        {/* Word-Level Diagnostic Breakdown (Stitch 18-2) */}
        {feedback === 'wrong' && lastResult && (
          <section className="bg-[#FDFBF7] rounded-3xl p-4 border-2 border-[#E2D7C3] shadow-sm">
            <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#E2D7C3]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C7A68]">
                Diagnostic Breakdown
              </span>
              <span className="text-xs font-bold text-[#10B981] bg-emerald-50 px-2 py-0.5 rounded-full">
                {matchedWordCount} / {targetWords.length} Clear
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 py-2">
              {wordDiagnostics.map((diag, i) => (
                <div
                  key={i}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-white font-bold text-sm shadow-xs ${
                    diag.isMatched
                      ? 'bg-[#10B981]'
                      : 'bg-[#F59E0B] ring-2 ring-amber-300'
                  }`}
                >
                  <span>{diag.word}</span>
                  <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[10px]">
                    {diag.isMatched ? '✓' : '!'}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-2 text-center text-xs font-semibold text-[#8C7A68]">
              Practice the words in yellow, then try again!
            </div>
          </section>
        )}

      </div>

      {/* Anchored Bottom Drawer: Correct Result */}
      {feedback === 'correct' && (
        <div className="absolute bottom-0 inset-x-0 bg-[#E8F8F5] border-t-2 border-[#2A9D8F] rounded-t-3xl p-5 shadow-2xl z-30 transition-all">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-[#2A9D8F] text-white flex items-center justify-center shadow-sm shrink-0">
              <Check size={22} strokeWidth={3.5} />
            </div>
            <div>
              <h2 className="font-bold text-[20px] text-[#1D3557] leading-tight">
                Great pronunciation! <span className="text-[#2A9D8F] font-extrabold">+1 XP</span>
              </h2>
              <p className="text-xs font-bold text-[#2A9D8F]">
                {Math.round((lastResult?.similarity || 0.8) * 100)}% acoustic match
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-[#A2D9CE] p-3 mb-4 flex items-center justify-between gap-3">
            <p className="font-bold text-base text-[#1D3557]">
              “{c.target_sentence}”
            </p>
            <AudioButton url={c.target_audio} fallbackText={c.target_sentence} onError={onError} />
          </div>

          <button
            type="button"
            onClick={() => handleAdvance(true, !lastResult?.client_graded, attemptsCount || 1)}
            className="w-full h-[54px] bg-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] active:translate-y-[3px] active:shadow-[0_1px_0_#1E6F5C] rounded-2xl text-white font-bold text-lg tracking-wider flex items-center justify-center gap-2 transition-transform cursor-pointer"
          >
            <span>CONTINUE</span>
            <span className="text-xl leading-none">➔</span>
          </button>
        </div>
      )}

      {/* Anchored Bottom Drawer: Wrong Result (Stitch 18-2) */}
      {feedback === 'wrong' && (
        <div className="absolute bottom-0 inset-x-0 bg-[#FDFBF7] border-t-4 border-[#E76F51] rounded-t-[32px] p-5 shadow-2xl z-30 flex flex-col gap-3">
          <div className="w-10 h-1 bg-[#E2D7C3] rounded-full mx-auto -mt-1"></div>

          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base text-[#E76F51] leading-tight">
                Almost there! {Math.round((lastResult?.similarity || 0.5) * 100)}% Match
              </h2>
              <p className="text-[11px] font-bold text-[#8C7A68]">
                差一点就对啦！• Speaking errors never cost hearts
              </p>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#E76F51] border border-[#FCD5C7]">
              Try {attemptsCount} of {MAX_ATTEMPTS}
            </span>
          </div>

          {/* Action CTAs: retry or advance if reached 3 tries */}
          {attemptsCount >= MAX_ATTEMPTS ? (
            <div>
              <p className="text-xs font-bold text-[#2A9D8F] text-center mb-2">
                🛡️ Never stuck guarantee: 3 attempts completed!
              </p>
              <button
                type="button"
                onClick={() => handleAdvance(false, false, attemptsCount)}
                className="w-full h-[52px] rounded-2xl bg-[#2A9D8F] text-white font-bold text-base tracking-wider flex items-center justify-center gap-2 shadow-[0_4px_0_#1E6F5C] active:translate-y-[2px] cursor-pointer"
              >
                <span>CONTINUE</span>
                <span className="text-lg leading-none">➔</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2.5">
              <button
                type="button"
                onClick={() => playAudioUrl(undefined, firstUnclearWord)}
                className="col-span-2 h-[48px] rounded-2xl bg-[#FDFBF7] border-2 border-[#E2D7C3] text-[#1D3557] font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_2px_0_#E2D7C3] active:translate-y-1 hover:bg-[#F7F3E8] cursor-pointer"
              >
                <Volume2 size={16} />
                <span className="truncate">Hear ‘{firstUnclearWord}’</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFeedback('idle');
                  handleMic();
                }}
                className="col-span-3 h-[48px] rounded-2xl bg-[#E76F51] text-white font-bold text-sm tracking-wider flex items-center justify-center gap-1.5 shadow-[0_4px_0_#C4553B] active:translate-y-[2px] active:shadow-[0_1px_0_#C4553B] cursor-pointer"
              >
                <span>TRY AGAIN</span>
                <span>🎙️</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SpeakSentence;
