// SpellingBeeStage — the shared play surface for both Spelling Bee surfaces:
// word card (image, or the speaker fallback when media is missing), the
// letter-slot runway, and the on-screen QWERTY keyboard with tactile 3D arcade
// keys and adaptive key-drop animation. Purely presentational — all state lives in
// useSpellingBeeTurn and the surface wrappers.
//
// There is no <input> anywhere: touch devices use the on-screen keys, and a
// window keydown listener in the turn controller covers physical keyboards
// (so the native keyboard never pops up on tablets).

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Volume2, Headphones, Lightbulb, Sparkles } from 'lucide-react';
import type { SpellingBeeWord } from './types';
import type { SpellingBeeStatus } from './useSpellingBeeTurn';
import { QWERTY_ROWS, slotLayout } from './keyboardEngine';

export interface SpellingBeeStageProps {
  word: SpellingBeeWord;
  typedCount: number;
  wrongLetter: string | null;
  removedKeys: ReadonlySet<string>;
  hintKey: string | null;
  status: SpellingBeeStatus;
  /** Presentation-beat skip (audit F1): board "Ready" tap starts typing. */
  onReady: () => void;
  onType: (letter: string) => void;
  onReplayAudio: () => void;
  /** Compact variant for the student app. */
  compact?: boolean;
  /** Light theme reskin for the student app (defaults to false so the BOARD surface renders pixel-identical). */
  lightTheme?: boolean;
}

const SpellingBeeStage: React.FC<SpellingBeeStageProps> = ({
  word,
  typedCount,
  wrongLetter,
  removedKeys,
  hintKey,
  status,
  onReady,
  onType,
  onReplayAudio,
  compact = false,
  lightTheme = false,
}) => {
  const slots = React.useMemo(() => slotLayout(word.word), [word.word]);
  const presenting = status === 'presenting'; // Look & listen beat — clock paused, no keyboard
  const typing = status === 'typing';
  const solved = status === 'solved';
  const revealed = status === 'revealed';

  // Target letter set for subtle keyboard scaffolding
  const targetLetters = React.useMemo(() => new Set(word.letters.split('')), [word.letters]);

  // ── Render Presentation Beat (Screen 1: Look & Listen) ───────────────────
  if (presenting && !compact) {
    return (
      <div className="flex flex-col items-center justify-between w-full max-w-5xl mx-auto select-none gap-3 py-1">
        {/* Context Prompt Banner */}
        <div className="w-full flex items-center justify-between bg-slate-900/80 border border-cyan-500/30 rounded-xl px-5 py-2.5 backdrop-blur-md shrink-0 shadow-lg">
          <div className="flex items-center gap-2.5 text-cyan-300">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center">
              <Headphones size={18} className="text-cyan-400" />
            </div>
            <span className="font-headline text-sm sm:text-base font-bold text-white tracking-wide">
              Listen carefully to the word and look at the picture
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-amber-500/10 border border-amber-400/30 px-3.5 py-1 rounded-full text-amber-300 text-xs font-bold font-mono uppercase">
            <Lightbulb size={14} className="text-amber-400" />
            <span>Repeat aloud before spelling!</span>
          </div>
        </div>

        {/* Hero 2-Column Presentation Unit */}
        <div className="grid grid-cols-12 gap-6 items-center w-full my-auto py-1">
          {/* Left Column: Hero Uncropped 4:3 Image Card */}
          <div className="col-span-12 md:col-span-6 flex justify-center items-center">
            <div className="relative w-full max-w-[460px] aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border-2 border-cyan-500/40 shadow-2xl p-2.5 glow-cyan flex items-center justify-center">
              {/* Category chip */}
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1 rounded-lg border border-cyan-400/40 shadow-md">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                <span className="font-mono text-[11px] font-bold text-cyan-300 uppercase tracking-wider">
                  Target Word · {word.letters.length} Letters
                </span>
              </div>

              {word.imageUrl ? (
                <div className="w-full h-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
                  <img
                    src={word.imageUrl}
                    alt={word.word}
                    className="w-full h-full object-contain rounded-xl transform hover:scale-105 transition-transform duration-500"
                    draggable={false}
                  />
                </div>
              ) : (
                <div className="w-full h-full rounded-xl bg-slate-900 flex flex-col items-center justify-center gap-3 text-cyan-400">
                  <Volume2 size={64} className="animate-pulse" />
                  <span className="font-mono text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Acoustic Target
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Interactive Listening Station */}
          <div className="col-span-12 md:col-span-6 flex flex-col justify-center gap-4">
            <div className="bg-[#0B132B]/90 border-2 border-cyan-400/30 rounded-2xl p-5 sm:p-6 flex flex-col gap-4 shadow-xl relative overflow-hidden backdrop-blur-md">
              {/* Audio Play & Visualizer */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={onReplayAudio}
                  aria-label="Play pronunciation"
                  className="w-20 h-20 rounded-2xl bg-cyan-950 border-2 border-cyan-400 text-cyan-300 flex flex-col items-center justify-center gap-1 shadow-[0_0_20px_rgba(0,255,204,0.35)] hover:scale-105 active:scale-95 transition-all cursor-pointer group shrink-0"
                >
                  <Volume2 size={32} className="group-hover:scale-110 transition-transform text-cyan-300" />
                  <span className="font-mono text-[10px] font-extrabold tracking-wider uppercase">PLAY</span>
                </button>

                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Sparkles size={13} /> Phonics Audio
                    </span>
                    <span className="text-slate-400 text-[11px]">[SPACE]</span>
                  </div>
                  {/* Soundwave bars */}
                  <div className="h-12 bg-slate-950/80 border border-slate-800 rounded-xl px-4 flex items-center justify-between gap-1 overflow-hidden">
                    {Array.from({ length: 12 }, (_, i) => (
                      <div
                        key={i}
                        className="w-1.5 bg-cyan-400 rounded-full wave-bar"
                        style={{ animationDelay: `${(i % 5) * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Subtitle / Meaning pill (F6 disambiguation) */}
              <div className="flex items-center gap-3 pt-1">
                {word.meaning && (
                  <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-400/40 px-3.5 py-1.5 rounded-xl">
                    <span className="font-mono text-xs font-bold text-amber-400 uppercase tracking-wider">Meaning:</span>
                    <span className="font-headline text-base font-extrabold text-amber-300 tracking-wide">
                      {word.meaning}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl font-mono text-xs text-slate-300">
                  <span className="text-slate-400">Length:</span>
                  <strong className="text-cyan-400 font-bold">{word.letters.length} Letters</strong>
                </div>
              </div>

              {/* Preview Letter Tile Slots */}
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                  Word Slots Preview:
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {slots.map((slot, i) => (
                    <div
                      key={i}
                      className="w-10 h-12 rounded-xl border-2 border-dashed border-cyan-400/60 bg-slate-900/60 flex items-center justify-center text-cyan-300 font-headline font-black text-xl shadow-[0_0_10px_rgba(0,255,204,0.15)]"
                    >
                      {slot.char === ' ' ? '' : '•'}
                    </div>
                  ))}
                </div>
              </div>

              {/* Primary Action Button */}
              <button
                type="button"
                onClick={onReady}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-pink-600 via-rose-600 to-pink-600 hover:from-pink-500 hover:to-rose-500 text-white font-headline text-sm sm:text-base font-black tracking-wider uppercase flex items-center justify-center gap-3 shadow-[0_0_24px_rgba(255,45,120,0.45)] hover:scale-[1.02] active:scale-95 transition-all cursor-pointer mt-1"
              >
                <span>Ready to spell →</span>
                <span className="font-mono text-xs font-bold bg-black/30 px-2.5 py-0.5 rounded text-white">[ENTER]</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render Active Typing / Solved / Revealed Stage ───────────────────────
  return (
    <div
      className={`flex flex-col items-center justify-between w-full select-none gap-2 sm:gap-3 ${
        compact ? 'max-w-xl mx-auto' : 'max-w-5xl mx-auto'
      }`}
    >
      {/* ── Top Clue & Replay Banner ── */}
      <div
        className={`w-full rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-3 sm:gap-4 relative overflow-hidden ${
          lightTheme
            ? 'bg-[#FDFBF7] border-2 border-[#E2D7C3] shadow-md'
            : 'bg-[#0B132B]/90 border border-slate-700/80 shadow-lg backdrop-blur-sm'
        } ${compact ? 'h-20' : 'h-20 sm:h-24'}`}
      >
        {/* Left Thumbnail */}
        <div
          className={`h-full aspect-[4/3] rounded-xl overflow-hidden shrink-0 flex items-center justify-center relative ${
            lightTheme
              ? 'border-2 border-[#E2D7C3] bg-[#F7F3E8]'
              : 'border border-slate-700 bg-black/60'
          } ${
            solved ? (lightTheme ? 'border-[#2A9D8F] ring-2 ring-[#2A9D8F]/30' : 'border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]') : ''
          }`}
        >
          {word.imageUrl ? (
            <img src={word.imageUrl} alt="" className="w-full h-full object-contain" draggable={false} />
          ) : (
            <Volume2 size={24} className={lightTheme ? 'text-[#1CB0F6]' : 'text-cyan-400'} />
          )}
          {solved && (
            <div className={`absolute inset-0 flex items-center justify-center ${lightTheme ? 'bg-[#2A9D8F]/20' : 'bg-emerald-950/40'}`}>
              <Check size={28} className={`${lightTheme ? 'text-[#2A9D8F]' : 'text-emerald-400'} font-bold drop-shadow`} />
            </div>
          )}
        </div>

        {/* Center: Replay & Meaning cues */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onReplayAudio}
              aria-label="Replay audio"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono font-bold text-xs tracking-wide transition-all active:scale-95 cursor-pointer shrink-0 ${
                lightTheme
                  ? 'bg-[#1CB0F6] hover:bg-[#0284C7] text-white shadow-[0_3px_0_#0284C7] active:translate-y-0.5'
                  : 'bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-400/60 text-cyan-300 hover:text-white shadow-[0_0_10px_rgba(56,189,248,0.2)]'
              }`}
            >
              <Volume2 size={16} />
              <span>REPLAY SOUND</span>
              <span className={`text-[10px] px-1 py-0.2 rounded ${lightTheme ? 'bg-white/25 text-white' : 'bg-cyan-400/20 text-cyan-200'}`}>[SPACE]</span>
            </button>

            {word.meaning && (
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl font-headline font-bold text-xs ${
                lightTheme
                  ? 'bg-[#FCE8B2] border border-[#E9C46A] text-[#8C6D1F]'
                  : 'bg-amber-500/15 border border-amber-400/40 text-amber-300'
              }`}>
                <span>💡 {word.meaning}</span>
              </div>
            )}

            <div className={`hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-xs ${
              lightTheme ? 'bg-[#F7F3E8] border border-[#E2D7C3] text-[#264653]' : 'bg-slate-800 text-slate-300'
            }`}>
              <span>{word.letters.length} Letters</span>
            </div>
          </div>
        </div>

        {/* Right Status / Prompt */}
        <div className="hidden md:flex flex-col items-end justify-center pr-2 shrink-0 font-mono text-xs">
          {solved ? (
            <span className={`${lightTheme ? 'text-[#2A9D8F]' : 'text-emerald-400'} font-bold flex items-center gap-1 text-sm`}>
              <Check size={16} /> SOLVED!
            </span>
          ) : revealed ? (
            <span className={`${lightTheme ? 'text-[#E76F51]' : 'text-amber-400'} font-bold text-sm`}>WORD REVEALED</span>
          ) : (
            <span className={lightTheme ? 'text-[#8C7A68] text-xs' : 'text-slate-400 text-xs'}>Type or Tap to Spell</span>
          )}
        </div>
      </div>

      {/* ── Letter Slot Runway (Projector Scale) ── */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-4 my-1 sm:my-2 flex-wrap select-none">
        <AnimatePresence mode="popLayout">
          {slots.map((slot, i) => {
            if (slot.letterIndex < 0) {
              return (
                <span key={i} className={`inline-block w-2 sm:w-4 text-center font-black text-2xl ${lightTheme ? 'text-[#8C7A68]' : 'text-slate-500'}`}>
                  {slot.char === ' ' ? '' : slot.char}
                </span>
              );
            }
            const filled = slot.letterIndex < typedCount;
            const isCursor = typing && slot.letterIndex === typedCount;
            const isJustTyped = typing && slot.letterIndex === typedCount - 1;
            const showLetter = filled || revealed;
            const slotNum = String(slot.letterIndex + 1).padStart(2, '0');

            const slotStyle = lightTheme
              ? solved
                ? 'bg-[#E6F4F1] border-2 border-[#2A9D8F] text-[#1E6F5C] shadow-[0_3px_0_#1E6F5C]'
                : revealed
                  ? 'bg-[#FCE8B2] border-2 border-[#E9C46A] text-[#8C6D1F] shadow-[0_3px_0_#C99E32]'
                  : filled
                    ? 'bg-[#E9C46A] border-2 border-[#C99E32] text-[#1D3557] shadow-[0_3px_0_#C99E32]'
                    : isCursor
                      ? 'bg-[#FDFBF7] border-2 border-[#E9C46A] text-[#1D3557] ring-4 ring-[#E9C46A]/30 shadow-[0_2px_0_#D5C7B0]'
                      : 'bg-[#FDFBF7] border-2 border-dashed border-[#E2D7C3] text-transparent shadow-[0_2px_0_#D5C7B0]'
              : solved
                ? 'bg-emerald-950/50 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.45)]'
                : revealed
                  ? filled
                    ? 'bg-slate-800 border-2 border-slate-600 text-white'
                    : 'bg-amber-500/15 border-2 border-amber-400 text-amber-300'
                  : filled
                    ? isJustTyped
                      ? 'bg-amber-950/40 border-2 border-amber-400 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.45)]'
                      : 'bg-[#111C3D] border-2 border-cyan-400 text-white shadow-[0_0_15px_rgba(56,189,248,0.25)]'
                    : isCursor
                      ? 'bg-slate-800/60 border-2 border-dashed border-cyan-400/90 text-transparent shadow-[0_0_18px_rgba(56,189,248,0.2)] animate-pulse'
                      : 'bg-slate-800/30 border-2 border-dashed border-slate-700 text-transparent';

            return (
              <motion.div
                key={i}
                layout
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: isJustTyped ? 1.05 : 1, opacity: 1 }}
                className={`spelling-slot-box relative rounded-2xl flex flex-col items-center justify-center transition-all ${
                  compact
                    ? 'w-12 h-16 sm:w-14 sm:h-18 text-2xl'
                    : 'w-16 h-20 sm:w-20 sm:h-24 md:w-24 md:h-28 text-3xl sm:text-4xl md:text-5xl'
                } ${slotStyle}`}
              >
                {/* Slot index label */}
                <span
                  className={`spelling-slot-tag absolute top-1.5 left-2 font-mono text-[10px] font-bold ${
                    lightTheme
                      ? 'text-[#8C7A68]'
                      : solved
                        ? 'text-emerald-400'
                        : filled
                          ? isJustTyped
                            ? 'text-amber-400'
                            : 'text-cyan-400/80'
                          : isCursor
                            ? 'text-cyan-400'
                            : 'text-slate-600'
                  }`}
                >
                  {slotNum}
                </span>

                {/* Letter character */}
                <span className="font-headline font-black tracking-wider">
                  {showLetter ? slot.char : isCursor ? (
                    <span className={`w-6 h-1 rounded-full animate-bounce inline-block ${lightTheme ? 'bg-[#E76F51]' : 'bg-cyan-400'}`} />
                  ) : ''}
                </span>

                {/* Status pill under slot */}
                {!compact && (
                  <div className="spelling-slot-tag absolute -bottom-2.5">
                    {solved ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-mono font-black tracking-wider flex items-center gap-0.5 shadow">
                        <Check size={10} /> DONE
                      </span>
                    ) : filled ? (
                      isJustTyped ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-400 text-black text-[9px] font-mono font-black tracking-wider shadow">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-cyan-400 text-slate-950 text-[9px] font-mono font-extrabold tracking-wider flex items-center gap-0.5 shadow">
                          <Check size={10} /> LOCKED
                        </span>
                      )
                    ) : isCursor ? (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-400/20 border border-cyan-400 text-cyan-300 text-[9px] font-mono font-extrabold tracking-wider">
                        NEXT
                      </span>
                    ) : null}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ── On-Screen QWERTY Keyboard with Tactile 3D Arcade Keys ── */}
      <div className={`w-full p-2 sm:p-3 rounded-2xl sm:rounded-3xl shrink-0 ${
        lightTheme
          ? 'bg-[#FDFBF7] border-2 border-[#E2D7C3] shadow-md'
          : 'bg-[#0B132B]/85 border border-slate-800 shadow-2xl backdrop-blur-md'
      }`}>
        <div className="flex flex-col gap-1.5 sm:gap-2 w-full items-center">
          {QWERTY_ROWS.map((row, rowIdx) => (
            <div key={rowIdx} className="flex justify-center gap-1 sm:gap-2 w-full">
              <AnimatePresence>
                {row.map((letter) => {
                  if (removedKeys.has(letter)) {
                    // Shed distractor key drops off cleanly
                    return (
                      <div
                        key={letter}
                        className="flex-1 max-w-[136px] h-10 sm:h-12 md:h-14 opacity-0 pointer-events-none"
                      />
                    );
                  }
                  const isWrong = wrongLetter === letter;
                  const isHint = hintKey === letter;
                  const isTarget = targetLetters.has(letter);

                  const keyClass = lightTheme
                    ? isWrong
                      ? 'bg-[#FF4B4B] border-2 border-[#DC2626] text-white animate-sb-shake shadow-[0_3px_0_#B91C1C]'
                      : isHint
                        ? 'bg-[#E9C46A] border-2 border-[#C99E32] text-[#1D3557] ring-4 ring-[#E9C46A]/50 shadow-[0_3px_0_#C99E32]'
                        : isTarget && typing
                          ? 'bg-[#E6F4F1] border-2 border-[#2A9D8F] hover:bg-[#D4ECE7] text-[#1D3557] shadow-[0_3px_0_#1E6F5C]'
                          : 'bg-[#FDFBF7] border-2 border-[#E2D7C3] hover:bg-[#F7F3E8] text-[#264653] shadow-[0_3px_0_#D5C7B0] active:translate-y-[2px] active:shadow-[0_1px_0_#D5C7B0]'
                    : isWrong
                      ? 'bg-gradient-to-b from-rose-500 to-rose-700 border-rose-400 text-white animate-sb-shake shadow-[0_4px_0_#881337]'
                      : isHint
                        ? 'bg-gradient-to-b from-amber-400 to-amber-500 border-amber-300 text-slate-950 ring-4 ring-amber-300/70 shadow-[0_4px_0_#78350f]'
                        : isTarget && typing
                          ? 'bg-gradient-to-b from-[#162a52] to-[#0d1c3a] border-cyan-500/60 hover:border-cyan-400 text-cyan-200 hover:text-white shadow-[0_4px_0_#06142a]'
                          : 'bg-gradient-to-b from-[#151f38] to-[#0d1424] border-slate-700 hover:border-slate-500 text-slate-200 hover:text-white shadow-[0_4px_0_#060a12]';

                  return (
                    <motion.button
                      key={letter}
                      type="button"
                      layout
                      initial={{ opacity: 0, y: -10 }}
                      animate={{
                        opacity: typing ? 1 : 0.45,
                        y: 0,
                        scale: isWrong ? 1.1 : isHint ? 1.08 : 1,
                      }}
                      exit={{ opacity: 0, y: 30, transition: { duration: 0.25 } }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      whileTap={typing ? { scale: 0.92 } : undefined}
                      onClick={() => typing && onType(letter)}
                      disabled={!typing}
                      className={`spelling-key-btn flex-1 max-w-[136px] h-10 sm:h-12 md:h-14 rounded-xl sm:rounded-2xl border font-headline font-bold flex flex-col items-center justify-center transition-all cursor-pointer select-none ${
                        lightTheme ? '' : 'key-cap-bevel'
                      } ${
                        compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl md:text-3xl'
                      } ${keyClass}`}
                    >
                      <span>{letter}</span>
                      {isTarget && !isWrong && !isHint && typing && (
                        <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${lightTheme ? 'bg-[#2A9D8F]' : 'bg-cyan-400/80'}`} />
                      )}
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .glow-cyan {
          box-shadow: 0 0 20px rgba(0, 255, 204, 0.25), inset 0 0 12px rgba(0, 255, 204, 0.08);
        }
        .key-cap-bevel {
          box-shadow: 0 4px 0 #070d18, 0 8px 16px rgba(0, 0, 0, 0.5);
        }
        .key-cap-bevel:active {
          box-shadow: 0 1px 0 #070d18, 0 3px 6px rgba(0, 0, 0, 0.4);
          transform: translateY(3px);
        }
        @keyframes wavePulse {
          0%, 100% { height: 6px; }
          50% { height: 32px; }
        }
        .wave-bar {
          animation: wavePulse 1.1s ease-in-out infinite;
        }
        @keyframes sb-shake {
          0%, 100% { transform: translateX(0); }
          25%, 75% { transform: translateX(-6px); }
          50% { transform: translateX(6px); }
        }
        .animate-sb-shake { animation: sb-shake 0.35s ease-in-out; }

        @media (max-height: 450px) {
          .spelling-slot-box {
            width: 2.75rem !important;
            height: 3.25rem !important;
            font-size: 1.25rem !important;
          }
          .spelling-slot-tag {
            display: none !important;
          }
          .spelling-key-btn {
            height: 2.25rem !important;
            font-size: 1.1rem !important;
            border-radius: 0.5rem !important;
          }
        }
      `}</style>
    </div>
  );
};

export default SpellingBeeStage;
