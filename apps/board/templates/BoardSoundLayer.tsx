// BoardSoundLayer — board-side audio for the teacher Sound Board.
//
// Workstream B3.1: previously `SidebarPanel` and `SoundBoardModal` emitted
// SOUND_* actions but NO board template subscribed to them, and no <audio>
// element existed anywhere on the board. The "Sounds play on Classroom Board"
// footer in SoundBoardModal was false. This layer is the receiver that makes
// it true.
//
// Implementation choice: Web Audio API synthesis. The projector plays the
// sounds, so we want zero asset dependencies (no files to ship, no CDN to
// depend on, works offline). Each cue is a short synthesized tone/chord that
// matches the cue's semantic (correct = bright rising major chord, wrong =
// descending buzz, etc.). This is the same approach classroom response apps
// use when they don't ship a sound pack.
//
// Mounted inside BoardShell so it lives for the whole board session.

import React, { useEffect, useRef } from 'react';
import { useSession } from '../../../store/SessionContext';

/**
 * Play a synthesized cue. Exposed for unit testing / reuse.
 * Guarded so a missing AudioContext (very old browsers) is a no-op.
 */
export function playSoundCue(ctx: AudioContext | null, id: string): void {
  if (!ctx) return;
  const now = ctx.currentTime;

  // Helper: schedule a single oscillator with a gain envelope.
  const tone = (freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + start);
    env.gain.setValueAtTime(0, now + start);
    env.gain.linearRampToValueAtTime(gain, now + start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(env).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  };

  switch (id) {
    case 'SOUND_CORRECT':
      // Bright rising major arpeggio (C5, E5, G5, C6).
      tone(523.25, 0.00, 0.12);
      tone(659.25, 0.10, 0.12);
      tone(783.99, 0.20, 0.12);
      tone(1046.5, 0.30, 0.22);
      break;
    case 'SOUND_WRONG':
      // Descending low square buzz (A3 -> F3).
      tone(220.00, 0.00, 0.18, 'square', 0.14);
      tone(174.61, 0.16, 0.28, 'square', 0.14);
      break;
    case 'SOUND_DING':
      // Clean bell-like triangle hit (E6).
      tone(1318.5, 0.00, 0.45, 'triangle', 0.20);
      break;
    case 'SOUND_DRUMROLL':
      // Quick low-mid noise burst (approximated with fast sawtooth taps).
      for (let i = 0; i < 8; i++) tone(120 + (i % 2) * 30, i * 0.05, 0.05, 'sawtooth', 0.10);
      break;
    case 'SOUND_WIN':
      // Triumphant C-major chord (C5 + E5 + G5 sustained).
      tone(523.25, 0.00, 0.5);
      tone(659.25, 0.00, 0.5);
      tone(783.99, 0.00, 0.6);
      break;
    case 'SOUND_ZAP':
      // Falling zappy sweep (sawtooth pitch bend down).
      tone(880, 0.00, 0.25, 'sawtooth', 0.16);
      // pitch bend handled by a second tone an octave lower right after.
      tone(440, 0.10, 0.20, 'sawtooth', 0.14);
      break;
    default:
      break;
  }
}

const BoardSoundLayer: React.FC = () => {
  const { state } = useSession();
  const ctxRef = useRef<AudioContext | null>(null);

  // Lazily create the AudioContext on first SOUND_* event (browsers require
  // a user-gesture before audio plays; the teacher's tap on the remote is
  // that gesture, and it propagates as a broadcast — close enough for the
  // projector tab to be allowed to play).
  const ensureCtx = (): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctxRef.current = new Ctor();
      return ctxRef.current;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (typeof a.type === 'string' && a.type.startsWith('SOUND_')) {
      const ctx = ensureCtx();
      // Some browsers leave the context "suspended" until resumed.
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      playSoundCue(ctx, a.type);
    }
  }, [state.lastAction]);

  // Cleanup the AudioContext on unmount.
  useEffect(() => () => { ctxRef.current?.close().catch(() => {}); }, []);

  return null; // audio-only layer, renders nothing
};

export default BoardSoundLayer;
