import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, MoreHorizontal, Mic, MicOff, Headphones, Loader2, MessageSquare, Check, X, Volume2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { startPronunciationCheck, isSpeechRecognitionSupported, speakText, stopSpeaking } from '../../services/SpeechService';
import { toast } from 'sonner';

interface PronunciationCoachProps {
  onBack: () => void;
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
}

const PronunciationCoach: React.FC<PronunciationCoachProps> = ({
  onBack,
  mode = 'standalone',
  onReady,
  validateTrigger,
  onResult,
  data
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [attempts, setAttempts] = useState<PronunciationAttempt[]>([]);
  const [currentAttempt, setCurrentAttempt] = useState<PronunciationAttempt | null>(null);
  const [isSupported] = useState(isSpeechRecognitionSupported());
  const [showResult, setShowResult] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [userBars, setUserBars] = useState<number[]>(new Array(15).fill(5));

  const targetSentence = data?.targetSentence || data?.targetWord || "Let's practice English conversation!";

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
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 32;
      animateBars();
    } catch (err) {
      console.error('Audio visualizer failed:', err);
    }
  };

  const stopAudioVisualizer = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current) audioContextRef.current.close();
    streamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    setUserBars(new Array(15).fill(5));
  };

  const animateBars = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const bars = Array.from(dataArray.slice(0, 15)).map(v => Math.max(5, (v / 255) * 100));
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
    setShowResult(false);
    startAudioVisualizer();

    recognitionRef.current = startPronunciationCheck(
      targetSentence,
      (result) => {
        setIsListening(false);
        stopAudioVisualizer();
        setCurrentAttempt(result);
        setShowResult(true);
        setAttempts(prev => [...prev, result]);
        if (onResult) onResult(result.isCorrect);
      },
      (error) => {
        setIsListening(false);
        stopAudioVisualizer();
        toast.error(error);
      },
      (interim) => {
        setInterimText(interim);
      }
    );
  }, [targetSentence, isSupported, onResult]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    stopAudioVisualizer();
  }, []);

  const handleSpeakTarget = () => {
    setIsSpeaking(true);
    speakText(targetSentence, 0.85);
    setTimeout(() => setIsSpeaking(false), targetSentence.length * 100 + 500);
  };

  const handleRetry = () => {
    setShowResult(false);
    setCurrentAttempt(null);
    startListening();
  };

  if (!isSupported) {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <Mic size={40} className="text-slate-300" />
        </div>
        <h2 className="text-xl font-bold text-slate-700 mb-2">Not Supported</h2>
        <p className="text-slate-500 mb-6">Speech recognition is not available in your browser. Try Chrome or Edge.</p>
        <button onClick={onBack} className="bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold">Go Back</button>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900 text-white flex flex-col font-sans">
      {mode === 'standalone' && (
        <header className="px-4 py-4 flex items-center justify-between border-b border-white/10">
          <button onClick={onBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
            <ChevronLeft size={24} />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pronunciation</span>
            <span className="font-bold">Practice</span>
          </div>
          <div className="w-10"></div>
        </header>
      )}

      <div className="flex-1 px-6 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="bg-white/10 backdrop-blur px-4 py-2 rounded-full border border-white/20 mb-6 flex items-center gap-2 z-10">
          <MessageSquare size={16} className="text-duo-blue" />
          <span className="text-sm font-bold">{targetSentence}</span>
        </div>

        <button
          onClick={handleSpeakTarget}
          disabled={isSpeaking}
          className={`mb-8 p-3 rounded-full flex items-center gap-2 z-10 transition-all ${isSpeaking ? 'bg-blue-500/30 text-blue-300' : 'bg-white/10 hover:bg-white/20 text-white'}`}
        >
          <Volume2 size={18} className={isSpeaking ? 'animate-pulse' : ''} />
          <span className="text-sm font-bold">{isSpeaking ? 'Speaking...' : 'Listen'}</span>
        </button>

        <div className="flex flex-col items-center gap-8 z-10 w-full max-w-md">
          <div className="h-16 w-full flex items-center justify-center gap-1">
            {userBars.map((h, i) => (
              <div
                key={i}
                className={`w-2 rounded-full transition-all duration-75 ${isListening ? 'bg-duo-green' : 'bg-slate-700'}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {isListening ? 'Listening...' : 'You'}
          </div>
        </div>

        {interimText && isListening && (
          <div className="mt-6 text-center z-10">
            <p className="text-lg text-white/60 italic">"{interimText}"</p>
          </div>
        )}

        <AnimatePresence>
          {showResult && currentAttempt && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mt-6 w-full max-w-sm rounded-2xl p-5 border z-10 ${
                currentAttempt.isCorrect
                  ? 'bg-green-500/20 border-green-500/30'
                  : 'bg-red-500/20 border-red-500/30'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  currentAttempt.isCorrect ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  {currentAttempt.isCorrect ? <Check size={24} /> : <X size={24} />}
                </div>
                <div>
                  <div className="font-bold">{currentAttempt.isCorrect ? 'Excellent!' : 'Try Again'}</div>
                  <div className="text-sm text-white/60">Similarity: {Math.round(currentAttempt.similarity * 100)}%</div>
                </div>
              </div>
              <p className="text-sm text-white/80 mb-3">You said: "{currentAttempt.transcript}"</p>
              <p className="text-sm text-white/70">{currentAttempt.feedback}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {attempts.length > 0 && (
          <div className="mt-4 text-xs text-slate-400 z-10">
            Attempts: {attempts.length} | Correct: {attempts.filter(a => a.isCorrect).length}
          </div>
        )}

        <div className={`absolute inset-0 transition-opacity duration-1000 ${isListening ? 'opacity-20' : 'opacity-0'} pointer-events-none`}>
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-duo-green rounded-full mix-blend-screen filter blur-[100px]"></div>
        </div>
      </div>

      <div className="p-8 pb-12 flex items-center justify-center gap-6 border-t border-white/10 z-10 bg-slate-900">
        {showResult && (
          <button
            onClick={handleRetry}
            className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20 hover:bg-white/20"
          >
            <RefreshCw size={24} />
          </button>
        )}

        <button
          onClick={isListening ? stopListening : startListening}
          className={`w-20 h-20 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${
            isListening
              ? 'border-red-500 bg-red-500/20 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]'
              : 'border-slate-700 bg-duo-green text-white shadow-[0_8px_0_#2f6f02] active:translate-y-2 active:shadow-none'
          }`}
        >
          {isListening ? <MicOff size={32} /> : <Mic size={32} />}
        </button>
      </div>
    </div>
  );
};

export default PronunciationCoach;
