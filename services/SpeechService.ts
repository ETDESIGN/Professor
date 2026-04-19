import { MediaService } from './MediaService';
import { createClientLogger } from './logger';

const log = createClientLogger('SpeechService');

type SpeechRecognitionEvent = {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
        confidence: number;
      };
      isFinal: boolean;
      length: number;
    };
    length: number;
  };
  resultIndex: number;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

interface PronunciationResult {
  transcript: string;
  confidence: number;
  similarity: number;
  isCorrect: boolean;
  feedback: string;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function calculateSimilarity(spoken: string, target: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const a = normalize(spoken);
  const b = normalize(target);

  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - distance / maxLen);
}

export function generateFeedback(similarity: number, target: string): string {
  if (similarity >= 0.95) return 'Perfect pronunciation! Keep it up!';
  if (similarity >= 0.8) return `Good job! Try to match: "${target}"`;
  if (similarity >= 0.6) return `Almost there. Listen carefully to: "${target}"`;
  return `Keep practicing! Target: "${target}"`;
}

export function startPronunciationCheck(
  targetText: string,
  onResult: (result: PronunciationResult) => void,
  onError: (error: string) => void,
  onInterim?: (transcript: string) => void
): SpeechRecognitionInstance | null {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    onError('Speech recognition is not supported in this browser.');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const lastResult = event.results[event.results.length - 1];

    if (!lastResult.isFinal && onInterim) {
      onInterim(lastResult[0].transcript);
      return;
    }

    if (lastResult.isFinal) {
      const transcript = lastResult[0].transcript;
      const confidence = lastResult[0].confidence;
      const similarity = calculateSimilarity(transcript, targetText);
      const isCorrect = similarity >= 0.8;

      onResult({
        transcript,
        confidence,
        similarity,
        isCorrect,
        feedback: generateFeedback(similarity, targetText),
      });
    }
  };

  recognition.onerror = (event: { error: string }) => {
    if (event.error === 'no-speech') {
      onError('No speech detected. Please try again.');
    } else if (event.error === 'not-allowed') {
      onError('Microphone access denied. Please allow microphone permissions.');
    } else {
      onError(`Speech recognition error: ${event.error}`);
    }
  };

  recognition.start();
  return recognition;
}

const audioCache = new Map<string, HTMLAudioElement>();

export async function speakText(text: string, rate: number = 0.9): Promise<void> {
  const cachedAudio = audioCache.get(text);
  if (cachedAudio) {
    cachedAudio.currentTime = 0;
    cachedAudio.play();
    return;
  }

  try {
    const unitId = 'tts-global';
    const audioUrl = await MediaService.getVocabAudio(unitId, text, text);

    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audioCache.set(text, audio);
      await audio.play();
      log.info('tts_generated_audio_played', { metadata: { textLength: text.length } });
      return;
    }
  } catch (err: any) {
    log.warn('tts_generated_fallback', { error: err.message });
  }

  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = rate;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export async function speakVocabWord(unitId: string, word: string, contextSentence?: string): Promise<void> {
  const cachedAudio = audioCache.get(`${unitId}:${word}`);
  if (cachedAudio) {
    cachedAudio.currentTime = 0;
    cachedAudio.play();
    return;
  }

  try {
    const audioUrl = await MediaService.getVocabAudio(unitId, word, contextSentence);

    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audioCache.set(`${unitId}:${word}`, audio);
      await audio.play();
      return;
    }
  } catch (err: any) {
    log.warn('vocab_audio_fallback', { error: err.message });
  }

  speakText(word);
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return;
  window.speechSynthesis.cancel();
  audioCache.forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
}

export function preloadVocabAudio(unitId: string, vocabulary: { word: string; context_sentence?: string }[]): Promise<void> {
  return MediaService.preloadUnitAssets(unitId, vocabulary);
}
