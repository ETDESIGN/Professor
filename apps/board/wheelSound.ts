// wheelSound — WebAudio-synthesized SFX for the carnival picker wheel.
// Zero assets, zero network: a quiet tick per segment crossing and a short
// rising arpeggio when the winner lands (design: Duolingo-feel sound, subtle
// by default, classroom-safe volume, mutable).
//
// Autoplay policy: an AudioContext born without a user gesture stays
// 'suspended'. We attach a one-time resume-on-first-interaction listener and
// simply stay silent until the browser lets us play — never throw, never block.

let ctx: AudioContext | null = null;
let resumeBound = false;

const STORAGE_KEY = 'professor.wheel.muted';

export function isWheelMuted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setWheelMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    /* private mode etc. — session-only mute is fine */
  }
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined' || isWheelMuted()) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    if (!resumeBound) {
      resumeBound = true;
      const resume = () => { ctx?.resume().catch(() => {}); };
      window.addEventListener('pointerdown', resume, { once: true });
      window.addEventListener('keydown', resume, { once: true });
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx.state === 'running' ? ctx : null;
}

/** Quiet mechanical tick as a wedge divider passes the flapper. Pitch wobbles
 *  slightly so a long crawl doesn't sound like a metronome error. */
export function playTick(): void {
  const c = ensureCtx();
  if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(880 + Math.random() * 160, t);
  gain.gain.setValueAtTime(0.03, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}

/** Short rising triangle-wave arpeggio + sparkle when the winner card lands. */
export function playLandFanfare(): void {
  const c = ensureCtx();
  if (!c) return;
  const base = c.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const t = base + i * 0.07;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.055, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}
