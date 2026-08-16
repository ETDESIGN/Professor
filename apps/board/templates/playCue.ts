// playCue — game-side sound cues for the new-gen games (NEWGEN_AUDIT Tier 1 #6).
//
// The audit found that NO game plays any sound: correct/wrong taps are silent
// color swaps, the #1 "feels limited" contributor. The synth engine already
// existed in BoardSoundLayer (Web Audio, zero assets); this module exposes it
// to game components with semantic names.
//
// Usage in a game component's answer handler:
//   playCue('correct') | playCue('wrong') | playCue('streak')
//   playCue('reveal')  | playCue('win')
//
// Sound plays on the BOARD tab (where the game renders) — no broadcast needed.
// Browsers gate audio behind a user gesture; the teacher's taps on the board
// are gestures, and remote-triggered taps resume a suspended context best-effort
// (same pattern as BoardSoundLayer).

import { playSoundCue } from './BoardSoundLayer';

export type CueKind = 'correct' | 'wrong' | 'streak' | 'reveal' | 'win';

const CUE_ID: Record<CueKind, string> = {
  correct: 'SOUND_CORRECT',
  wrong: 'SOUND_WRONG',
  streak: 'SOUND_STREAK',
  reveal: 'SOUND_REVEAL',
  win: 'SOUND_WIN',
};

let ctx: AudioContext | null = null;

const ensureCtx = (): AudioContext | null => {
  if (ctx) return ctx;
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
};

/** Play a synthesized game cue on the board tab. Never throws; no-op without
 *  an AudioContext. Fire-and-forget — safe to call in any event handler. */
export function playCue(kind: CueKind): void {
  try {
    const audio = ensureCtx();
    if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
    playSoundCue(audio, CUE_ID[kind]);
  } catch {
    // Sound is enhancement, never load-bearing — swallow all failures.
  }
}

/** Start a repeating "ticking clock" loop (e.g. the memorize-phase countdown
 *  in BoardMemoryLab). Each tick is one ~40ms sine blip at ~880Hz (gain
 *  ~0.08) scheduled at ctx.currentTime — same tone shape as playSoundCue's
 *  envelope, on this module's shared AudioContext. Driven by setInterval:
 *  precision is not critical, this is a tension cue, not a metronome.
 *
 *  Returns a stop function that clears the interval. Calling the stop
 *  function more than once is safe (first stop wins, later calls are no-ops),
 *  so overlapping owners can never leak the interval. */
export function startTickLoop(intervalMs = 1000): () => void {
  let stopped = false;
  const tick = () => {
    try {
      const audio = ensureCtx();
      if (!audio) return;
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const now = audio.currentTime;
      const osc = audio.createOscillator();
      const env = audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(0.08, now + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      osc.connect(env).connect(audio.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // Sound is enhancement, never load-bearing — swallow all failures.
    }
  };
  const id = window.setInterval(tick, intervalMs);
  return () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(id);
  };
}
