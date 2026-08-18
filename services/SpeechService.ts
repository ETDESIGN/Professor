import { MediaService } from './MediaService';
import { resolveSpeech } from './speechResolver';
import { createClientLogger } from './logger';
import { supabase } from './supabaseClient';

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
  // Mic-based pronunciation checking is possible when EITHER path works:
  //  - Web Speech API (fast + free, but Chrome routes audio via Google and
  //    fails with a 'network' error in regions where Google is blocked)
  //  - MediaRecorder + server STT fallback (region-safe, needs mic access)
  if (getSpeechRecognition() !== null) return true;
  return canUseServerStt();
}

function canUseServerStt(): boolean {
  return typeof window !== 'undefined'
    && !!(window as any).MediaRecorder
    && !!navigator.mediaDevices?.getUserMedia;
}

// Latch: once Chrome's Web Speech proves unusable (region-blocked 'network'
// error, or it ends silently with no result), stop wasting every tap on it —
// go straight to the server-STT recorder for the rest of the session.
// Without this, each tap burns the user's sentence on a doomed Web Speech
// attempt and the recorder starts AFTER they already spoke (audit 2026-08-17).
let webSpeechBlocked = false;

/** Handle returned by startPronunciationCheck — call stop() to end early. */
export interface PronunciationCheckHandle {
  stop: () => void;
}

/** Decode the recorded blob and re-encode as 16-bit PCM WAV. Browsers record
 *  webm/opus or mp4 — codec/container support on STT models is inconsistent,
 *  while WAV is universally accepted. Returns null if decoding fails. */
async function blobToWavBase64(blob: Blob): Promise<{ base64: string; seconds: number } | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    await audioCtx.close().catch(() => {});

    const channels = Math.min(1, decoded.numberOfChannels);
    const sampleRate = decoded.sampleRate;
    // Downsample to 16 kHz mono — plenty for speech, 10x smaller payload.
    const targetRate = 16000;
    const ratio = sampleRate / targetRate;
    const src = decoded.getChannelData(0);
    const length = Math.floor(src.length / ratio);
    const samples = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, src[Math.floor(i * ratio)]));
      samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Minimal WAV header (mono, 16-bit, 16 kHz).
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buf);
    const writeStr = (off: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, channels, true); view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * channels * 2, true); view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true); writeStr(36, 'data'); view.setUint32(40, samples.length * 2, true);
    new Int16Array(buf, 44).set(samples);

    // base64 without FileReader (exact length, no async race).
    const bytes = new Uint8Array(buf);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return { base64: btoa(binary), seconds: length / targetRate };
  } catch (err: any) {
    log.warn('wav_encode_failed', { error: err?.message || String(err) });
    return null;
  }
}

/**
 * Record the mic, send the audio to the evaluate-pronunciation edge function
 * (region-safe STT via OpenRouter), and map the evaluation to the same
 * PronunciationResult contract as Web Speech. Auto-stops after ~1.2s of
 * silence once speech has started (AnalyserNode level detection), hard-caps
 * at 10s, and can be stopped manually.
 */
async function startServerSttCheck(
  targetText: string,
  onResult: (result: PronunciationResult) => void,
  onError: (error: string) => void,
  passThreshold: number,
): Promise<PronunciationCheckHandle | null> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    onError('Microphone access denied. Please allow microphone permissions.');
    return null;
  }

  const mimeType = ['audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    stream.getTracks().forEach(t => t.stop());
    onError('Audio recording is not supported in this browser.');
    return null;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* already stopped */ }
    stream.getTracks().forEach(t => t.stop());
    audioCtx.close().catch(() => {});
  };

  // Silence detection: watch the input level; once speech has started,
  // stop after 1.2s below the threshold. Hard cap at 10s.
  const audioCtx = new AudioContext();
  // Browsers create AudioContexts 'suspended' outside a user gesture (and
  // sometimes even inside one) — a suspended context feeds the analyser
  // nothing, so silence detection never sees speech and every take ends as
  // "No speech detected". Resume before watching (audit 2026-08-17).
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume(); } catch { /* gesture-backed resume */ }
  }
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  const levels = new Uint8Array(analyser.frequencyBinCount);
  const SPEECH_LEVEL = 14; // RMS-ish scale out of 128 — tuned for close-mic speech
  const SILENCE_MS = 1200;
  const MAX_MS = 10_000;
  let spoke = false;
  let silenceSince = 0;
  let raf = 0;
  const startedAt = performance.now();
  const watch = () => {
    analyser.getByteFrequencyData(levels);
    let sum = 0;
    for (let i = 0; i < levels.length; i++) sum += levels[i];
    const avg = sum / levels.length;
    if (avg > SPEECH_LEVEL) {
      spoke = true;
      silenceSince = 0;
    } else if (spoke && silenceSince === 0) {
      silenceSince = performance.now();
    }
    if ((spoke && silenceSince > 0 && performance.now() - silenceSince > SILENCE_MS)
      || performance.now() - startedAt > MAX_MS) {
      finish();
      return;
    }
    raf = requestAnimationFrame(watch);
  };

  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    if (!spoke || blob.size < 2000) {
      onError('No speech detected. Please try again.');
      return;
    }
    try {
      // Re-encode to 16 kHz mono WAV — universally digestible by STT models,
      // unlike the browser's webm/opus or mp4 containers.
      const wav = await blobToWavBase64(blob);
      if (!wav) {
        onError('Could not process the recording. Please try again.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('evaluate-pronunciation', {
        body: {
          targetText,
          audioBase64: wav.base64,
          audioFormat: 'wav',
          language: 'en',
        },
      });
      if (error) throw new Error((data as any)?.error || error.message);

      const ev = (data as any)?.evaluation;
      if (!ev || !ev.transcript) {
        onError(ev?.feedback || 'Could not capture your speech. Try again.');
        return;
      }
      const similarity = ev.similarity ?? 0;
      onResult({
        transcript: ev.transcript,
        confidence: ev.confidence ?? 0.5,
        similarity,
        isCorrect: similarity >= passThreshold,
        feedback: generateFeedback(similarity, targetText),
      });
    } catch (err: any) {
      log.warn('server_stt_failed', { error: err?.message || String(err) });
      onError('Speech check failed — the voice service may be busy. Try again.');
    }
  };

  recorder.start();
  raf = requestAnimationFrame(watch);
  return { stop: finish };
}

export function startPronunciationCheck(
  targetText: string,
  onResult: (result: PronunciationResult) => void,
  onError: (error: string) => void,
  onInterim?: (transcript: string) => void,
  /** Lenient for young learners (default 0.6); 0.8 is adult-harsh. P-F. */
  passThreshold = 0.6,
): PronunciationCheckHandle | null {
  const SpeechRecognition = getSpeechRecognition();
  const useWebSpeech = !!SpeechRecognition && !webSpeechBlocked;

  // The active recorder (server-STT path) so the returned stop() controls
  // whichever path is live.
  let activeServerStop: (() => void) | null = null;
  const startFallback = () => {
    if (!canUseServerStt()) {
      onError('Speech recognition is not supported in this browser.');
      return;
    }
    startServerSttCheck(targetText, onResult, onError, passThreshold).then(h => {
      if (h) activeServerStop = h.stop;
    });
  };

  // No Web Speech available, or it already proved region-blocked earlier in
  // this session → go straight to the server-STT recorder. Skipping the
  // doomed Web Speech attempt matters: it fails only AFTER the user has
  // spoken, so the recorder would always start too late (audit 2026-08-17).
  if (!useWebSpeech) {
    if (!SpeechRecognition && !canUseServerStt()) {
      onError('Speech recognition is not supported in this browser.');
      return null;
    }
    startFallback();
    return { stop: () => activeServerStop?.() };
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let gotResult = false;
  let handled = false; // an error or fallback already fired

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const lastResult = event.results[event.results.length - 1];

    if (!lastResult.isFinal && onInterim) {
      onInterim(lastResult[0].transcript);
      return;
    }

    if (lastResult.isFinal) {
      gotResult = true;
      const transcript = lastResult[0].transcript;
      const confidence = lastResult[0].confidence;
      const similarity = calculateSimilarity(transcript, targetText);
      const isCorrect = similarity >= passThreshold;

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
    // Chrome's Web Speech routes audio via Google — in regions where Google
    // is unreachable it dies with 'network'/'service-not-allowed' (and
    // sometimes reports 'no-speech' or 'audio-capture' for the same root
    // cause). Latch the blockage and use the region-safe recorder instead.
    const networkClass = event.error === 'network' || event.error === 'service-not-allowed';
    if (networkClass) {
      handled = true;
      webSpeechBlocked = true;
      log.warn('web_speech_blocked_region_fallback', { metadata: { error: event.error } });
      startFallback();
      return;
    }
    if (event.error === 'no-speech') {
      handled = true;
      onError('No speech detected. Please try again.');
    } else if (event.error === 'not-allowed') {
      handled = true;
      onError('Microphone access denied. Please allow microphone permissions.');
    } else {
      handled = true;
      onError(`Speech recognition error: ${event.error}`);
    }
  };

  // Silent-death guard: a blocked Web Speech sometimes fires onend with no
  // result and no error. Treat one empty ending as "service unusable" →
  // latch + fallback so the SECOND tap records properly (the current take's
  // audio is already lost at that point).
  recognition.onend = () => {
    if (gotResult || handled) return;
    handled = true;
    webSpeechBlocked = true;
    log.warn('web_speech_silent_end_fallback');
    startFallback();
  };

  try {
    recognition.start();
  } catch {
    // start() throws when a previous instance is still active — fall back.
    handled = true;
    startFallback();
  }
  return { stop: () => { try { recognition.stop(); } catch { /* not started */ } activeServerStop?.(); } };
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

/**
 * Start a continuous Web Speech recognition session that accumulates final
 * transcripts. Used by the Dubbing Studio to obtain a region-free transcript
 * alongside MediaRecorder audio, so pronunciation scoring never depends on a
 * region-blocked STT API. Returns null when Web Speech is unavailable; callers
 * must treat the transcript as best-effort.
 */
export function captureTranscript(onUpdate?: (fullTranscript: string) => void): SpeechRecognitionInstance | null {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let accumulated = '';
  recognition.onresult = (event: SpeechRecognitionEvent) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        accumulated += (accumulated ? ' ' : '') + event.results[i][0].transcript;
      }
    }
    onUpdate?.(accumulated);
  };
  recognition.onerror = () => {
    // Best-effort capture; ignore transient errors so audio recording continues.
  };

  try {
    recognition.start();
  } catch {
    // start() throws if already started; safe to ignore.
  }
  return recognition;
}

const audioCache = new Map<string, HTMLAudioElement>();

/**
 * Browser speechSynthesis fallback with correct language tagging (zh-CN for
 * Simplified Chinese L1, en-US otherwise). Instant — this is what keeps game
 * turns unblocked when generated audio isn't cached yet (~1–2s engagement).
 */
export function browserSpeak(text: string, lang?: string, rate: number = 0.9): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
  utterance.rate = rate;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export async function speakText(text: string, rate: number = 0.9, lang?: string): Promise<void> {
  const cachedAudio = audioCache.get(text);
  if (cachedAudio) {
    cachedAudio.currentTime = 0;
    cachedAudio.play();
    return;
  }

  try {
    // On-demand cached TTS (Qwen via OpenRouter → ElevenLabs chain). Bounded
    // budget: if no URL within ~1.5s the browser voice takes over — playback
    // is never held hostage by generation latency.
    const res = await resolveSpeech({ text, lang, unitId: 'tts-global' }, { budgetMs: 1500 });

    if (res.url) {
      const audio = new Audio(res.url);
      audioCache.set(text, audio);
      await audio.play();
      log.info('tts_generated_audio_played', { metadata: { textLength: text.length, provider: res.provider } });
      return;
    }
    if (res.status === 'generating') {
      log.info('tts_still_generating_browser_fallback', { metadata: { textLength: text.length } });
    }
  } catch (err: any) {
    log.warn('tts_generated_fallback', { error: err.message });
  }

  browserSpeak(text, lang, rate);
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

const urlAudioCache = new Map<string, HTMLAudioElement>();

/**
 * Play a generated audio_url (from a pool item) directly. If the URL is missing
 * or playback fails, fall back to speakText() (cached Qwen/ElevenLabs TTS via
 * the resolver, then window.speechSynthesis). Returns true if audio actually
 * played. This is the single audio seam every exercise component uses.
 */
export async function playAudioUrl(url?: string, fallbackText?: string, lang?: string): Promise<boolean> {
  if (url) {
    try {
      let audio = urlAudioCache.get(url);
      if (!audio) {
        audio = new Audio(url);
        urlAudioCache.set(url, audio);
      }
      audio.currentTime = 0;
      await audio.play();
      return true;
    } catch (err: any) {
      log.warn('audio_url_play_failed', { error: err?.message || String(err) });
    }
  }
  if (fallbackText) {
    try {
      await speakText(fallbackText, 0.9, lang);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
