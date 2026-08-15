// useSpeechRecognition.ts — Shared speech recognition hook for board games
//
// Extracted from student app SpeakSentence.tsx for reuse in new-gen board games.
// Provides Web Speech API integration with Levenshtein scoring.

import { useState, useRef, useCallback } from 'react';
import { levenshteinSimilarity, SPEECH_PASS_THRESHOLD } from './scoringUtils';

interface UseSpeechRecognitionOptions {
  targetText: string;
  onResult?: (score: number, transcript: string, passed: boolean) => void;
  onError?: (message: string) => void;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  score: number | null;
  transcript: string | null;
  passed: boolean | null;
}

export function useSpeechRecognition({
  targetText,
  onResult,
  onError,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [passed, setPassed] = useState<boolean | null>(null);
  const recognitionRef = useRef<any>(null);

  const isSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const startListening = useCallback(() => {
    if (!isSupported) {
      onError?.('Speech recognition not supported in this browser');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setScore(null);
      setTranscript(null);
      setPassed(null);
    };

    recognition.onresult = (event: any) => {
      const result = event.results[0][0].transcript;
      setTranscript(result);

      const similarity = levenshteinSimilarity(result.toLowerCase(), targetText.toLowerCase());
      const passedThreshold = similarity >= SPEECH_PASS_THRESHOLD;

      setScore(similarity);
      setPassed(passedThreshold);
      onResult?.(similarity, result, passedThreshold);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      onError?.(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, targetText, onResult, onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
    score,
    transcript,
    passed,
  };
}
