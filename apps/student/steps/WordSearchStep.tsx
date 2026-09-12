// WordSearchStep — the in-lesson surface of Word Search for WORD_SEARCH
// blocks on the Student Path. Reuses the board v3 word-search PURE modules
// (wordSearch/gridEngine.ts + content.ts — placement, line snapping and
// segment matching are the same tested logic the projector runs); only the
// interaction is student-side: tap the first letter, tap the last letter.
//
// Same contract as FastVocabStep/SpellingBeeStep: self-fetching by unitId,
// loading/error/play/done screens, recordAnswer feeds session accuracy, and
// XP is awarded by the lesson pipeline (never here) exactly once.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Loader2, Search, Star, Volume2 } from 'lucide-react';
import { useSoloSession } from '../../../store/SoloSessionContext';
import { supabase } from '../../../services/supabaseClient';
import { toPoolItem, type PoolItem } from '../../../types/exercise';
import { getVocabulary } from '../../../services/manifest';
import { playCue } from '../../board/templates/playCue';
import { playAudioUrl } from '../../../services/SpeechService';
import {
  buildGrid,
  snapLine,
  matchSegment,
  type Cell,
  type SearchGrid,
} from '../../board/templates/wordSearch/gridEngine';
import {
  poolToWords,
  vocabularyToWords,
  takeRound,
  toGridWords,
  type SearchWord,
} from '../../board/templates/wordSearch/content';

interface WordSearchStepProps {
  unitId: string;
  unitTitle: string;
  onDone: () => void;
  onExit: () => void;
}

type Screen = 'loading' | 'play' | 'done' | 'error';

const ROUND_SIZE = 8;

// Translucent pastel highlighter ribbons for found words in Wonder Atlas palette.
const FOUND_TRAILS = [
  'bg-[#2A9D8F]/25 border-2 border-[#2A9D8F] text-[#1E6F5C]', // Teal
  'bg-[#E91E63]/20 border-2 border-[#E91E63] text-[#9C1040]', // Pink
  'bg-[#E9C46A]/35 border-2 border-[#C99E32] text-[#7B5809]', // Amber
  'bg-[#38BDF8]/25 border-2 border-[#0284C7] text-[#0369A1]', // Sky
  'bg-[#E76F51]/25 border-2 border-[#E76F51] text-[#9A3412]', // Coral
  'bg-[#8B5CF6]/25 border-2 border-[#8B5CF6] text-[#5B21B6]', // Violet
  'bg-[#10B981]/25 border-2 border-[#10B981] text-[#065F46]', // Emerald
  'bg-[#F59E0B]/25 border-2 border-[#F59E0B] text-[#92400E]', // Orange
];

const trailFor = (index: number) => FOUND_TRAILS[index % FOUND_TRAILS.length];

const WordSearchStep: React.FC<WordSearchStepProps> = ({ unitId, unitTitle, onDone, onExit }) => {
  const { recordAnswer, state } = useSoloSession();

  const [screen, setScreen] = useState<Screen>('loading');
  const [words, setWords] = useState<SearchWord[]>([]);
  const [grid, setGrid] = useState<SearchGrid | null>(null);
  const [foundIds, setFoundIds] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [wrongCells, setWrongCells] = useState<string[]>([]);
  const [missCount, setMissCount] = useState(0);
  const [hintCell, setHintCell] = useState<string | null>(null);
  const statsRef = useRef({ found: 0, attempts: 0 });

  const loadRun = useCallback(async () => {
    setScreen('loading');
    setFoundIds([]);
    setAnchor(null);
    setMissCount(0);
    setHintCell(null);
    statsRef.current = { found: 0, attempts: 0 };

    const { data, error } = await supabase
      .from('pool_items')
      .select('*')
      .eq('unit_id', unitId)
      .in('exercise_type', ['IMAGE_SELECT', 'MEANING_MATCH'])
      .limit(500);
    let words: SearchWord[] = [];
    if (!error && data) {
      const items: PoolItem[] = (data || []).map(toPoolItem).filter((p): p is PoolItem => p !== null);
      words = poolToWords(items);
    }
    // Vocabulary fallback (mirror of SpellingBeeStep): units whose pool hasn't
    // been generated still get their manifest/relational vocabulary words.
    if (words.length < 4) {
      words = vocabularyToWords(getVocabulary(state.activeUnit?.manifest));
    }
    if (words.length < 4) {
      setScreen('error');
      return;
    }
    const round = takeRound(words, Math.floor(Math.random() * 97) + 1, ROUND_SIZE);
    const built = buildGrid(toGridWords(round), { seed: (Math.random() * 0x7fffffff) | 0, fillBias: true });
    const placeable = round.filter((w) => !built.unplaced.includes(w.id));
    if (placeable.length < 3) {
      setScreen('error');
      return;
    }
    setWords(placeable);
    setGrid(built);
    setScreen('play');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, state.activeUnit?.id]);

  useEffect(() => { loadRun(); }, [loadRun]);

  const wordIndex = (id: string) => words.findIndex((w) => w.id === id);

  const handleCell = (cell: Cell) => {
    if (!grid || screen !== 'play') return;
    if (!anchor) {
      setAnchor(cell);
      return;
    }
    const line = snapLine(anchor, cell, grid.size);
    setAnchor(null);
    // Tapping the anchor cell again (or a neighbor that snaps to a 1-cell
    // line) just clears the anchor — not an attempt.
    if (line.length < 2) return;

    statsRef.current.attempts += 1;
    const candidates = toGridWords(words.filter((w) => !foundIds.includes(w.id)));
    const hit = matchSegment(line, grid, candidates);
    if (hit) {
      const idx = wordIndex(hit.id);
      const word = words[idx];
      setFoundIds((prev) => [...prev, hit.id]);
      statsRef.current.found += 1;
      recordAnswer(true);
      playCue('correct');
      if (word?.audioUrl) playAudioUrl(word.audioUrl, word.word).catch(() => {});
      if (statsRef.current.found >= words.length) {
        playCue('win');
        setTimeout(() => setScreen('done'), 500);
      }
    } else {
      recordAnswer(false);
      playCue('wrong');
      setMissCount((m) => m + 1);
      const keys = line.map((c) => `${c.row}-${c.col}`);
      setWrongCells(keys);
      setTimeout(() => setWrongCells([]), 450);
    }
  };

  const handleUseHint = () => {
    if (missCount < 3) return;
    const unfound = words.find((w) => !foundIds.includes(w.id));
    if (!unfound || !grid) return;
    const placement = grid.placements.find((p) => p.wordId === unfound.id);
    if (!placement || placement.cells.length === 0) return;
    const firstCell = placement.cells[0];
    const key = `${firstCell.row}-${firstCell.col}`;
    setHintCell(key);
    playCue('reveal');
    setMissCount(0);
    setTimeout(() => {
      setHintCell((curr) => (curr === key ? null : curr));
    }, 4000);
  };

  if (screen === 'loading') {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#8C7A68] font-sans p-6 select-none">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-8 shadow-md flex flex-col items-center">
          <Loader2 className="animate-spin mb-3 text-[#2A9D8F]" size={36} />
          <p className="font-bold text-[#1D3557] text-base">Building the grid…</p>
        </div>
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#264653] font-sans p-6 select-none">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-6 shadow-md max-w-sm text-center w-full">
          <div className="w-16 h-16 bg-[#F7F3E8] border-2 border-[#E2D7C3] text-[#2A9D8F] rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-xs">
            <Search size={32} />
          </div>
          <p className="text-lg font-bold text-[#1D3557] mb-1">Not enough words yet</p>
          <p className="text-[#8C7A68] text-sm mb-6">This puzzle needs the unit's vocabulary — continue with the lesson for now.</p>
          <button
            onClick={onDone}
            className="w-full py-3 bg-[#2A9D8F] hover:brightness-105 text-white font-bold rounded-2xl shadow-[0_4px_0_#1E6F5C] active:translate-y-0.5 active:shadow-none transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'done') {
    const { found, attempts } = statsRef.current;
    const totalWords = words.length || 1;
    const misses = Math.max(0, attempts - found);
    // Completion + efficiency with miss tolerance (step-local display stars only):
    const stars = found >= totalWords
      ? (misses <= 3 ? 5 : misses <= 6 ? 4 : 3)
      : (found >= Math.ceil(totalWords / 2) ? 2 : 1);
    const accuracy = attempts > 0 ? Math.round((found / attempts) * 100) : 100;

    return (
      <div className="h-full bg-[#EAE0D0] flex flex-col items-center justify-center text-[#264653] font-sans p-6 relative overflow-y-auto select-none">
        <div className="bg-[#FDFBF7] border-2 border-[#E2D7C3] rounded-3xl p-6 shadow-xl max-w-sm text-center w-full">
          <motion.h1
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            className="text-3xl font-black text-[#1D3557] mb-1 font-fredoka"
          >
            All Words Discovered! 🎉
          </motion.h1>
          <p className="text-[#8C7A68] text-xs font-semibold mb-4">
            太棒了！所有隐藏单词已全部找到！
          </p>

          <div className="flex justify-center gap-1.5 mb-6">
            {Array.from({ length: 5 }, (_, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2 + i * 0.18, type: 'spring', stiffness: 300, damping: 14 }}
              >
                <Star
                  size={36}
                  className={i < stars ? 'text-[#E9C46A] drop-shadow-sm' : 'text-[#E2D7C3]'}
                  fill={i < stars ? 'currentColor' : 'none'}
                />
              </motion.span>
            ))}
          </div>

          <p className="text-4xl font-black tabular-nums text-[#2A9D8F] mb-0.5">{found}/{words.length}</p>
          <p className="text-[11px] font-bold text-[#8C7A68] uppercase tracking-widest mb-4">words found</p>

          {/* Word recap pills */}
          <div className="flex flex-wrap justify-center gap-1.5 mb-6 max-h-32 overflow-y-auto">
            {words.map((w) => (
              <button
                key={w.id}
                onClick={() => w.audioUrl && playAudioUrl(w.audioUrl, w.word).catch(() => {})}
                className="px-2.5 py-1 rounded-xl bg-[#F7F3E8] border border-[#E2D7C3] text-[#1D3557] font-bold text-xs flex items-center gap-1 hover:border-[#2A9D8F] cursor-pointer"
              >
                <span>{w.word}</span>
                {w.audioUrl && <Volume2 size={12} className="text-[#1CB0F6]" />}
              </button>
            ))}
          </div>

          <div className="flex justify-around text-center mb-6 bg-[#F7F3E8] border border-[#E2D7C3] rounded-2xl p-2.5">
            <div>
              <p className="text-lg font-black text-[#2A9D8F] tabular-nums">{accuracy}%</p>
              <p className="text-[10px] font-bold text-[#8C7A68] uppercase">accuracy</p>
            </div>
            <div>
              <p className="text-lg font-black text-[#1D3557] tabular-nums">{misses}</p>
              <p className="text-[10px] font-bold text-[#8C7A68] uppercase">misses</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={loadRun}
              className="flex-1 py-3 bg-[#F7F3E8] hover:bg-white text-[#264653] border-2 border-[#E2D7C3] shadow-[0_3px_0_#D5C7B0] active:translate-y-0.5 active:shadow-none rounded-2xl font-bold transition-all text-sm"
            >
              Play again
            </button>
            <button
              onClick={onDone}
              className="flex-1 py-3 bg-[#2A9D8F] hover:brightness-105 text-white shadow-[0_4px_0_#1E6F5C] active:translate-y-0.5 active:shadow-none rounded-2xl font-bold transition-all text-sm"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Screen: play ────────────────────────────────────────────────────────
  if (!grid) return null;
  const foundTrail = new Map<string, string>(); // cellKey → trail class
  foundIds.forEach((id) => {
    const placement = grid.placements.find((p) => p.wordId === id);
    const trail = trailFor(Math.max(0, wordIndex(id)));
    placement?.cells.forEach((c) => foundTrail.set(`${c.row}-${c.col}`, trail));
  });

  const canUseHint = missCount >= 3;

  return (
    <div className="h-full bg-[#EAE0D0] flex flex-col font-sans relative overflow-hidden select-none">
      {/* Universal light header */}
      <header className="h-16 px-4 bg-[#FDFBF7] border-b-2 border-[#E2D7C3] flex items-center justify-between shrink-0 z-20">
        <button
          onClick={onExit}
          className="w-10 h-10 rounded-2xl bg-[#F7F3E8] border-2 border-[#E2D7C3] flex items-center justify-center text-[#8C7A68] hover:text-[#264653] active:translate-y-0.5 transition-all shadow-[0_2px_0_#D5C7B0]"
          title="Exit Lesson"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="flex items-center gap-2">
          {/* Terracotta Step Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E76F51] text-white text-xs font-bold shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>WORD SEARCH • {foundIds.length} / {words.length} FOUND</span>
          </div>

          {/* Hint FAB: active after 3 misses */}
          <button
            onClick={handleUseHint}
            disabled={!canUseHint}
            className={`flex items-center gap-1 px-3 py-1 rounded-full font-bold text-xs transition-all shadow-xs ${
              canUseHint
                ? 'bg-[#E9C46A] border-2 border-[#C99E32] text-[#1D3557] animate-pulse cursor-pointer shadow-[0_2px_0_#C99E32] active:translate-y-0.5'
                : 'bg-[#F7F3E8] border border-[#E2D7C3] text-[#B5A490] cursor-not-allowed opacity-60'
            }`}
            title={canUseHint ? 'Show first letter of an unfound word' : `${3 - missCount} more misses for hint`}
          >
            <span>🔍</span>
            <span>Hint{canUseHint ? '!' : ` (${missCount}/3)`}</span>
          </button>
        </div>

        <div className="px-3 py-1.5 bg-[#F7F3E8] border border-[#E2D7C3] rounded-xl font-black text-[#2A9D8F] tabular-nums text-sm shrink-0 shadow-xs">
          {foundIds.length}/{words.length}
        </div>
      </header>

      {/* Word bank chips */}
      <div className="px-4 py-2 flex flex-wrap gap-1.5 shrink-0 bg-[#FDFBF7]/80 border-b border-[#E2D7C3]/60">
        {words.map((w, i) => {
          const found = foundIds.includes(w.id);
          return (
            <button
              key={w.id}
              onClick={() => w.audioUrl && playAudioUrl(w.audioUrl, w.word).catch(() => {})}
              className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors flex items-center gap-1 ${
                found
                  ? `${trailFor(i)} line-through opacity-70`
                  : 'bg-[#FDFBF7] border-[#E2D7C3] text-[#1D3557] shadow-xs hover:border-[#2A9D8F]/60'
              }`}
            >
              <span>{w.word}</span>
              {w.audioUrl && !found && <Volume2 size={11} className="text-[#1CB0F6]" />}
            </button>
          );
        })}
      </div>

      {/* Letter Grid Container */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-3">
        <div className="bg-[#FDFBF7] rounded-[24px] border-[2.5px] border-[#E2D7C3] p-2.5 shadow-md mx-auto w-full max-w-sm">
          <div
            className="grid gap-1 w-full"
            style={{ gridTemplateColumns: `repeat(${grid.size}, minmax(0, 1fr))` }}
          >
            {grid.cells.map((row, r) =>
              row.map((letter, c) => {
                const key = `${r}-${c}`;
                const trail = foundTrail.get(key);
                const isAnchor = anchor?.row === r && anchor?.col === c;
                const isWrong = wrongCells.includes(key);
                const isHint = hintCell === key;

                const cls = trail
                  ? trail
                  : isAnchor
                    ? 'bg-[#38BDF8] border-2 border-[#0284C7] text-white shadow-md scale-105'
                    : isHint
                      ? 'bg-[#E9C46A] border-2 border-[#C99E32] text-[#1D3557] ring-4 ring-[#E9C46A]/50 animate-bounce'
                      : isWrong
                        ? 'bg-[#FEF2F2] border-2 border-[#FF4B4B] text-[#DC2626]'
                        : 'bg-[#FDFBF7] border border-[#E2D7C3] text-[#264653] hover:bg-[#F7F3E8] shadow-xs active:translate-y-0.5';

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleCell({ row: r, col: c })}
                    className={`aspect-square rounded-xl font-fredoka font-bold text-base sm:text-lg flex items-center justify-center transition-all duration-150 cursor-pointer ${cls}`}
                  >
                    {letter}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </div>

      {/* Reassurance instructional footer */}
      <p className="pb-3 pt-1 text-center text-[#8C7A68] text-xs font-semibold shrink-0">
        {anchor
          ? 'Now tap the last letter'
          : 'Tap first & last letter to find words • Exploratory taps do not cost hearts.'}
      </p>
    </div>
  );
};

export default WordSearchStep;
