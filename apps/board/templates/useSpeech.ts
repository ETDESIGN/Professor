// useSpeech — reference-based audio resolution for board game turns
// (2026-08-08 TTS upgrade). Pool items no longer need a pre-stored audio_url:
// on mount the hook background-resolves the speech via the cached on-demand
// resolver; play() NEVER awaits — if the generated URL isn't ready yet, the
// browser voice engages instantly (acceptance: fallback within ~1–2s, no turn
// ever blocks on audio). Once resolved, subsequent replays use the real URL.

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveSpeech } from '../../../services/speechResolver';
import { playAudioUrl, browserSpeak } from '../../../services/SpeechService';

export interface UseSpeechOptions {
  /** The text to speak (TTS source) when no audioUrl is present. */
  text?: string;
  /** Pre-stored audio (legacy items). Wins over text resolution. */
  audioUrl?: string;
  /** 'en' | 'zh' — auto-detected when omitted. */
  lang?: string;
  unitId?: string;
}

export function useSpeech({ text, audioUrl, lang, unitId }: UseSpeechOptions) {
  const resolvedRef = useRef<string | undefined>(audioUrl || undefined);
  const [isReady, setIsReady] = useState(Boolean(audioUrl));

  useEffect(() => {
    resolvedRef.current = audioUrl || undefined;
    setIsReady(Boolean(audioUrl));
    if (audioUrl || !text) return;
    let cancelled = false;
    // Background resolution — populates the shared cache; never blocks play().
    resolveSpeech({ text, lang, unitId })
      .then((res) => {
        if (!cancelled && res.url) {
          resolvedRef.current = res.url;
          setIsReady(true);
        }
      })
      .catch(() => { /* play() falls back to browser voice */ });
    return () => {
      cancelled = true;
    };
  }, [text, audioUrl, lang, unitId]);

  /** Play now. Cached URL if ready, else browser voice instantly. */
  const play = useCallback(() => {
    const url = resolvedRef.current;
    if (url) {
      playAudioUrl(url, text, lang).catch(() => {});
    } else if (text) {
      browserSpeak(text, lang);
    }
  }, [text, lang]);

  return { play, isReady };
}
