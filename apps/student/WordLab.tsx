// WordLab — the vocabulary STUDY phase (pedagogical redesign §5).
// Redesigned to Wonder Atlas warmth × Duolingo accents per stitch screens
// stitch/03-word-lab/1.html (5-card study grid & active card) and 3.html (flipped card back).
//
// Dual-coding (image + word + IPA + Chinese L1 + sound bound at once) + learner control + 5±2 chunking.
// Each card flips independently, every speaker is guaranteed to make sound,
// dual studied milestone badges (👂 Listened ✔ + 🔄 Flipped ✔), and a deliberate "I'm ready" gate before practice.

import React, { useMemo, useState } from 'react';
import { Volume2, RotateCw, Check, Star, ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import { CanonicalVocab } from '../../services/manifest';
import { playAudioUrl } from '../../services/SpeechService';
import { playCue } from '../board/templates/playCue';

interface WordLabProps {
  /** Rich vocab (image/audio/phonetic/l1 translation). Limited to ~5 inside. */
  cards: CanonicalVocab[];
  onReady: () => void;
}

const WordLab: React.FC<WordLabProps> = ({ cards, onReady }) => {
  const set = useMemo(() => cards.slice(0, 5), [cards]);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [played, setPlayed] = useState<Set<number>>(new Set());
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set());

  // A card counts as "studied" once it has been flipped AND its audio heard.
  const studiedCount = useMemo(
    () => set.filter((_, i) => flipped.has(i) && played.has(i)).length,
    [set, flipped, played],
  );
  const allStudied = studiedCount >= set.length && set.length > 0;

  const currentWord = set[activeCardIndex];

  const toggleFlip = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsFlipped((prev) => {
      const next = !prev;
      if (next) {
        setFlipped((f) => new Set(f).add(activeCardIndex));
        playCue('reveal');
      }
      return next;
    });
  };

  const handleSpeak = async (e: React.MouseEvent, i: number, url: string | undefined, fallback: string) => {
    e.stopPropagation();
    await playAudioUrl(url, fallback);
    setPlayed((prev) => {
      const next = new Set(prev).add(i);
      if (flipped.has(i) && !prev.has(i) && next.size === set.length && flipped.size === set.length) {
        playCue('win');
      }
      return next;
    });
  };

  const handleSelectCard = (idx: number) => {
    setActiveCardIndex(idx);
    setIsFlipped(false);
  };

  const handlePrevCard = () => {
    if (activeCardIndex > 0) {
      handleSelectCard(activeCardIndex - 1);
    }
  };

  const handleNextCardOrReady = () => {
    if (allStudied) {
      playCue('correct');
      onReady();
    } else if (activeCardIndex < set.length - 1) {
      handleSelectCard(activeCardIndex + 1);
    } else {
      onReady();
    }
  };

  if (set.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#8C7A68] p-6 text-center bg-[#EAE0D0]">
        <div className="w-16 h-16 rounded-2xl bg-[#FDFBF7] border-2 border-[#E2D7C3] flex items-center justify-center mb-3 shadow-sm">
          <BookOpen size={32} className="text-[#8C7A68]" />
        </div>
        <p className="font-fredoka font-bold text-lg text-[#1D3557]">No vocabulary to study for this unit.</p>
        <button
          onClick={onReady}
          className="mt-4 px-6 py-3 rounded-2xl bg-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] text-white font-fredoka font-bold active:translate-y-0.5"
        >
          Continue
        </button>
      </div>
    );
  }

  const isCurrentListened = played.has(activeCardIndex);
  const isCurrentFlipped = flipped.has(activeCardIndex);
  const isCurrentStudied = isCurrentListened && isCurrentFlipped;

  return (
    <div className="w-full h-full flex flex-col justify-between bg-[#EAE0D0] text-[#264653] select-none overflow-hidden">
      {/* 1. Main Scrollable Stage Area */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2 flex flex-col justify-between max-w-[420px] mx-auto w-full">
        {/* Top Status & Mascot Instructions */}
        <div className="space-y-2 shrink-0">
          {/* Subheader Status Row */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#E76F51] text-white rounded-full text-[11px] font-fredoka tracking-wider uppercase shadow-sm font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
              WORD LAB • VOCABULARY STUDY
            </div>
            <div className="inline-flex items-center gap-1 px-3 py-1 bg-[#FDFBF7] border border-[#E2D7C3] rounded-full text-[12px] font-fredoka font-bold text-[#264653] shadow-sm">
              <Star size={14} className="text-[#E9C46A] fill-[#E9C46A]" />
              <span>
                <strong className="text-[#2A9D8F]">{studiedCount}</strong> / {set.length} Studied
              </span>
            </div>
          </div>

          {/* Instructional Mascot Speech Bubble */}
          <div className="relative bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-2xl p-2.5 flex items-center gap-3 shadow-sm">
            {/* Mini Professor Owl Avatar */}
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-[#2A9D8F]/15 border-2 border-[#2A9D8F] flex items-center justify-center text-xl overflow-hidden shadow-inner">
                🦉
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#E9C46A] rounded-full border border-white flex items-center justify-center text-[9px] font-bold text-[#264653]">
                ★
              </div>
            </div>

            {/* Prompt text & Requirements */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-[#1D3557] leading-tight font-fredoka">
                Listen and flip each card to unlock practice!
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold font-fredoka transition-colors ${
                    isCurrentListened
                      ? 'bg-[#2A9D8F] text-white'
                      : 'bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 text-[#2A9D8F]'
                  }`}
                >
                  👂 {isCurrentListened ? 'Listened ✓' : 'Listen'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold font-fredoka transition-colors ${
                    isCurrentFlipped
                      ? 'bg-[#E9C46A] text-[#1D3557]'
                      : 'bg-[#E76F51]/10 border border-[#E76F51]/30 text-[#E76F51]'
                  }`}
                >
                  🔄 {isCurrentFlipped ? 'Flipped ✓' : 'Flip'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Central Active Card (Front / Back Flip View) */}
        <div className="relative py-2 flex items-center justify-center my-auto">
          {/* Peeking Left Card Hint (if not on first card) */}
          {activeCardIndex > 0 && (
            <button
              onClick={handlePrevCard}
              className="absolute -left-10 top-4 bottom-4 w-16 bg-[#FDFBF7]/70 rounded-2xl border-2 border-[#2A9D8F]/40 opacity-40 blur-[0.5px] transform -rotate-3 scale-95 flex flex-col items-center justify-center p-1 z-0 hover:opacity-70 transition-opacity"
              aria-label="Previous card"
            >
              <span className="text-xl">👈</span>
            </button>
          )}

          {/* Main Card Container */}
          <div
            className={`w-full max-w-[340px] bg-[#FDFBF7] border-2 rounded-[24px] p-4 shadow-[0_10px_24px_-4px_rgba(65,48,25,0.08),0_3px_0_0_#DED1BD] flex flex-col relative z-10 transition-all ${
              isCurrentStudied ? 'border-[#2A9D8F] ring-2 ring-[#2A9D8F]/20' : 'border-[#E2D7C3]'
            }`}
          >
            {!isFlipped ? (
              /* ================= FRONT CARD FACE ================= */
              <div className="flex flex-col">
                {/* Status Tags */}
                <div className="flex items-center justify-between pb-2 border-b border-[#E2D7C3]/60 mb-2.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-fredoka font-bold ${
                      isCurrentListened
                        ? 'bg-[#2A9D8F]/15 border border-[#2A9D8F] text-[#2A9D8F]'
                        : 'bg-[#F7F3E8] border border-dashed border-[#8C7A68]/50 text-[#8C7A68]'
                    }`}
                  >
                    {isCurrentListened ? 'Listened ✔' : 'Not heard yet'}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-fredoka font-bold ${
                      isCurrentFlipped
                        ? 'bg-[#E9C46A]/20 border border-[#E9C46A] text-[#1D3557]'
                        : 'bg-[#F7F3E8] border border-dashed border-[#E76F51]/70 text-[#E76F51]'
                    }`}
                  >
                    {isCurrentFlipped ? 'Flipped ✔' : 'Not flipped yet'}
                  </span>
                </div>

                {/* Card Visual / Illustration Container */}
                <div className="relative w-full h-[150px] rounded-xl overflow-hidden border border-[#E2D7C3] bg-[#F7F3E8] flex items-center justify-center">
                  {currentWord?.image_url && !imgErrors.has(activeCardIndex) ? (
                    <img
                      src={currentWord.image_url}
                      alt={currentWord.word}
                      className="w-full h-full object-cover object-center"
                      onError={() => setImgErrors((prev) => new Set(prev).add(activeCardIndex))}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-[#8C7A68] p-2">
                      <span className="text-4xl mb-1">📖</span>
                      <span className="text-xs font-fredoka font-bold text-[#8C7A68]">Wonder Atlas Card</span>
                    </div>
                  )}

                  {/* Card category chip overlay */}
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-md text-[10px] font-bold text-white tracking-wide font-fredoka">
                    Card {activeCardIndex + 1} of {set.length}
                  </div>

                  {isCurrentStudied && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 bg-[#2A9D8F] text-white rounded-md text-[10px] font-fredoka font-bold shadow flex items-center gap-1">
                      <span>✓</span> Studied
                    </div>
                  )}
                </div>

                {/* Word Meta & Audio Trigger Row */}
                <div className="flex items-center justify-between mt-3 px-1">
                  <div className="flex flex-col min-w-0 pr-2">
                    <h2 className="font-fredoka text-[26px] leading-tight font-bold text-[#1D3557] tracking-tight truncate">
                      {currentWord?.word}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      {currentWord?.phonetic && (
                        <span className="inline-block px-2 py-0.5 bg-[#F7F3E8] border border-[#E2D7C3] rounded-md text-[11px] font-bold font-mono text-[#8C7A68]">
                          {currentWord.phonetic}
                        </span>
                      )}
                      {currentWord?.part_of_speech && (
                        <span className="text-[11px] font-semibold text-[#8C7A68]">{currentWord.part_of_speech}</span>
                      )}
                    </div>
                  </div>

                  {/* 52x52 Duolingo Blue Audio FAB */}
                  <button
                    type="button"
                    onClick={(e) => handleSpeak(e, activeCardIndex, currentWord?.audio_url, currentWord?.word || '')}
                    className="w-[52px] h-[52px] min-w-[52px] rounded-2xl bg-[#1CB0F6] shadow-[0_4px_0_#0284C7] active:translate-y-0.5 active:shadow-[0_1px_0_#0284C7] text-white flex items-center justify-center transition-all cursor-pointer"
                    aria-label={`Pronounce ${currentWord?.word}`}
                    title="Play pronunciation"
                  >
                    <Volume2 size={24} className="fill-current" />
                  </button>
                </div>

                {/* Flip Card Affordance Button */}
                <button
                  type="button"
                  onClick={toggleFlip}
                  className="mt-3.5 w-full py-2.5 px-4 bg-[#F7F3E8] border-2 border-[#E2D7C3] rounded-xl flex items-center justify-center gap-2 text-[#264653] font-fredoka font-bold text-sm shadow-[0_3px_0_#D5C7B0] active:translate-y-0.5 active:shadow-none hover:bg-[#FAF6EE] transition-all cursor-pointer"
                >
                  <RotateCw size={16} className="text-[#E76F51]" />
                  <span>Tap to Flip Card</span>
                  <span className="text-xs bg-[#E76F51]/15 text-[#E76F51] px-1.5 py-0.5 rounded font-bold">
                    中文 / Meaning
                  </span>
                </button>
              </div>
            ) : (
              /* ================= FLIPPED BACK CARD FACE ================= */
              <div className="flex flex-col gap-2.5">
                {/* Top Metadata Strip */}
                <div className="flex items-center justify-between border-b border-[#E2D7C3]/70 pb-2">
                  <span className="px-2 py-0.5 bg-[#F7F3E8] text-[#8C7A68] font-fredoka font-bold text-[11px] rounded-lg border border-[#E2D7C3] uppercase tracking-wider">
                    Card {activeCardIndex + 1} of {set.length}
                  </span>
                  {isCurrentStudied ? (
                    <span className="text-[11px] font-fredoka font-bold text-[#2A9D8F] flex items-center gap-1">
                      <span>✨</span> Card Mastered!
                    </span>
                  ) : (
                    <span className="text-[11px] font-fredoka font-semibold text-[#8C7A68]">Study Details</span>
                  )}
                </div>

                {/* Header Row: Headword & 48px Duolingo Blue FAB */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col min-w-0 pr-2">
                    <h2 className="font-fredoka font-bold text-[24px] text-[#1D3557] leading-tight truncate">
                      {currentWord?.word}
                    </h2>
                    {currentWord?.phonetic && (
                      <span className="text-xs font-mono font-bold text-[#8C7A68] mt-0.5">
                        {currentWord.phonetic}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleSpeak(e, activeCardIndex, currentWord?.audio_url, currentWord?.word || '')}
                    className="w-12 h-12 min-w-[48px] rounded-2xl bg-[#1CB0F6] shadow-[0_3px_0_#0284C7] active:translate-y-0.5 active:shadow-[0_1px_0_#0284C7] text-white flex items-center justify-center transition-all cursor-pointer"
                    aria-label={`Listen to ${currentWord?.word}`}
                  >
                    <Volume2 size={22} className="fill-current" />
                  </button>
                </div>

                {/* Chinese L1 Meaning (Support Surface) */}
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded font-fredoka font-bold bg-[#E76F51] text-white text-[10px]">
                      中文释义
                    </span>
                    <span className="font-fredoka font-bold text-[17px] text-[#E76F51] tracking-wide">
                      {currentWord?.l1_translation || currentWord?.translation || '暂无释义'}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#8C7A68] font-bold">L1</span>
                </div>

                {/* Definition Box */}
                {currentWord?.definition && (
                  <div className="bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-2.5 flex flex-col gap-0.5">
                    <span className="font-fredoka font-bold text-[10px] uppercase tracking-wider text-[#8C7A68] flex items-center gap-1">
                      📖 Meaning
                    </span>
                    <p className="text-[13px] leading-snug font-bold text-[#264653] font-nunito">
                      {currentWord.definition}
                    </p>
                  </div>
                )}

                {/* Example Sentence Card with 40px Teal Audio Button */}
                {currentWord?.example_sentence && (
                  <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-2xl p-2.5 flex flex-col gap-1.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-fredoka font-bold text-[10px] uppercase tracking-wider text-[#2A9D8F]">
                        💡 Example Sentence
                      </span>
                      <span className="text-[10px] font-fredoka font-bold text-[#8C7A68]">Tap to hear 🎧</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={(e) =>
                          handleSpeak(e, activeCardIndex, currentWord?.example_audio_url, currentWord.example_sentence!)
                        }
                        className="w-9 h-9 min-w-[36px] rounded-full bg-[#2A9D8F] shadow-[0_3px_0_#1E6F5C] active:translate-y-0.5 active:shadow-[0_1px_0_#1E6F5C] text-white flex items-center justify-center cursor-pointer shrink-0"
                        aria-label="Listen to example sentence"
                      >
                        <Volume2 size={16} className="fill-current" />
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-extrabold text-[#1D3557] leading-snug">
                          “{currentWord.example_sentence}”
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dual Studied Badges */}
                <div className="bg-white/90 border border-[#E2D7C3] rounded-xl px-2.5 py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-fredoka font-bold text-[11px] ${
                        isCurrentListened ? 'bg-[#2A9D8F] text-white' : 'bg-[#F7F3E8] text-[#8C7A68]'
                      }`}
                    >
                      👂 {isCurrentListened ? 'Listened ✔' : 'Listen'}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-fredoka font-bold text-[11px] ${
                        isCurrentFlipped
                          ? 'bg-[#E9C46A] text-[#1D3557] border border-[#D4A338]'
                          : 'bg-[#F7F3E8] text-[#8C7A68]'
                      }`}
                    >
                      🔄 {isCurrentFlipped ? 'Flipped ✔' : 'Flip'}
                    </span>
                  </div>

                  <span className="text-[10px] font-fredoka font-bold text-[#2A9D8F]">
                    {isCurrentStudied ? 'Mastered!' : 'Complete both'}
                  </span>
                </div>

                {/* Flip Back to Front Action */}
                <button
                  type="button"
                  onClick={toggleFlip}
                  className="w-full h-10 rounded-xl bg-[#F7F3E8] border-2 border-[#E2D7C3] text-[#264653] font-fredoka font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_2px_0_#D7CBB3] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                >
                  <span>↩</span>
                  <span>Flip to Front (Picture View)</span>
                </button>
              </div>
            )}
          </div>

          {/* Peeking Right Card Hint (if not on last card) */}
          {activeCardIndex < set.length - 1 && (
            <button
              onClick={() => handleSelectCard(activeCardIndex + 1)}
              className="absolute -right-10 top-4 bottom-4 w-16 bg-[#FDFBF7]/70 rounded-2xl border-2 border-[#E2D7C3] opacity-40 blur-[0.5px] transform rotate-3 scale-95 flex flex-col items-center justify-center p-1 z-0 hover:opacity-70 transition-opacity"
              aria-label="Next card"
            >
              <span className="text-xl">👉</span>
            </button>
          )}
        </div>

        {/* 3. Bottom Mini-Thumbnail 5-Card Deck Row */}
        <div className="mt-1 shrink-0">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-[11px] font-fredoka font-bold uppercase tracking-wider text-[#8C7A68]">
              Study Deck ({set.length} Cards)
            </span>
            <span className="text-[10px] font-bold text-[#2A9D8F] font-fredoka">Tap to switch cards</span>
          </div>

          {/* 5-Card Horizontal Mini Grid */}
          <div className="grid grid-cols-5 gap-1.5 bg-[#FDFBF7]/80 p-2 rounded-2xl border border-[#E2D7C3]">
            {set.map((v, i) => {
              const isStudied = flipped.has(i) && played.has(i);
              const isActive = i === activeCardIndex;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectCard(i)}
                  className={`flex flex-col items-center text-center p-1 rounded-xl transition-all relative cursor-pointer ${
                    isActive
                      ? 'bg-[#2A9D8F]/15 border-2 border-[#2A9D8F] ring-2 ring-[#2A9D8F]/30 shadow-md'
                      : isStudied
                      ? 'bg-[#FDFBF7] border-2 border-[#2A9D8F] shadow-sm'
                      : 'bg-[#FDFBF7] border border-[#E2D7C3] opacity-90'
                  }`}
                >
                  {isStudied && (
                    <div className="absolute -top-1.5 -right-1 w-4 h-4 bg-[#2A9D8F] text-white rounded-full flex items-center justify-center text-[9px] font-black shadow">
                      ✓
                    </div>
                  )}

                  <div className="w-7 h-7 rounded-lg bg-[#EAE0D0]/50 flex items-center justify-center text-xs overflow-hidden">
                    {v.image_url && !imgErrors.has(i) ? (
                      <img src={v.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span>📖</span>
                    )}
                  </div>

                  <span
                    className={`text-[9.5px] font-fredoka font-bold mt-1 truncate w-full ${
                      isActive ? 'text-[#1D3557]' : 'text-[#8C7A68]'
                    }`}
                  >
                    {v.word}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Anchored Footer (Height: 80px) */}
      <footer className="h-20 shrink-0 bg-[#FDFBF7] border-t-2 border-[#E2D7C3] px-4 flex items-center justify-between gap-3 z-20">
        {/* Back Button */}
        <button
          type="button"
          onClick={handlePrevCard}
          disabled={activeCardIndex === 0}
          className="h-12 px-4 rounded-2xl bg-[#F7F3E8] border-2 border-[#E2D7C3] text-[#8C7A68] font-fredoka font-bold text-sm flex items-center gap-1.5 shadow-[0_3px_0_#D5C7B0] active:translate-y-0.5 active:shadow-none hover:text-[#264653] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        {/* Primary Action Button */}
        <button
          type="button"
          onClick={handleNextCardOrReady}
          className={`flex-1 h-12 rounded-2xl font-fredoka font-bold text-base tracking-wide flex items-center justify-center gap-2 transition-all cursor-pointer ${
            allStudied
              ? 'bg-[#2A9D8F] shadow-[0_4px_0_#1E6F5C] active:translate-y-0.5 active:shadow-[0_1px_0_#1E6F5C] text-white hover:bg-[#248B7E]'
              : 'bg-[#E76F51] shadow-[0_4px_0_#C4553B] active:translate-y-0.5 active:shadow-[0_1px_0_#C4553B] text-white hover:bg-[#D96346]'
          }`}
        >
          {allStudied ? (
            <>
              <span>I'M READY — LET'S PRACTICE</span>
              <ArrowRight size={18} />
            </>
          ) : activeCardIndex < set.length - 1 ? (
            <>
              <span>NEXT CARD ({activeCardIndex + 1}/{set.length})</span>
              <ArrowRight size={18} />
            </>
          ) : (
            <>
              <span>STUDIED ({studiedCount}/{set.length}) • CONTINUE</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </footer>
    </div>
  );
};

export default WordLab;
