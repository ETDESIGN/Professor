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
import { ChevronLeft, Loader2, Search, Star } from 'lucide-react';
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

// Distinct pastel trails for found words (index = position in the round).
const FOUND_TRAILS = [
  'bg-emerald-200 text-emerald-900',
  'bg-sky-200 text-sky-900',
  'bg-amber-200 text-amber-900',
  'bg-violet-200 text-violet-900',
  'bg-rose-200 text-rose-900',
  'bg-lime-200 text-lime-900',
  'bg-cyan-200 text-cyan-900',
  'bg-orange-200 text-orange-900',
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
  const statsRef = useRef({ found: 0, attempts: 0 });

  const loadRun = useCallback(async () => {
    setScreen('loading');
    setFoundIds([]);
    setAnchor(null);
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
        setTimeout(() => setScreen('done'), 450);
      }
    } else {
      recordAnswer(false);
      playCue('wrong');
      const keys = line.map((c) => `${c.row}-${c.col}`);
      setWrongCells(keys);
      setTimeout(() => setWrongCells([]), 450);
    }
  };

  if (screen === 'loading') {
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-slate-400 font-sans">
        <Loader2 className="animate-spin mb-3" size={28} />
        Building the grid…
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white font-sans p-6">
        <div className="w-16 h-16 bg-slate-800 text-emerald-400 rounded-2xl flex items-center justify-center mb-4">
          <Search size={30} />
        </div>
        <p className="text-lg font-bold mb-1">Not enough words yet</p>
        <p className="text-slate-400 text-sm mb-6 text-center">This puzzle needs the unit's vocabulary — continue with the lesson for now.</p>
        <button onClick={onDone} className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-2xl">
          Continue
        </button>
      </div>
    );
  }

  if (screen === 'done') {
    const { found, attempts } = statsRef.current;
    const accuracy = attempts > 0 ? Math.round((found / attempts) * 100) : 100;
    const stars = accuracy >= 90 ? 5 : accuracy >= 70 ? 4 : accuracy >= 50 ? 3 : 2;
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white font-sans p-6">
        <motion.h1
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="text-4xl font-black mb-1"
        >
          Puzzle Solved!
        </motion.h1>
        <p className="text-slate-400 mb-6">{unitTitle}</p>
        <div className="flex gap-2 mb-8">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} size={40} className={i < stars ? 'text-emerald-400' : 'text-slate-700'} fill={i < stars ? 'currentColor' : 'none'} />
          ))}
        </div>
        <p className="text-4xl font-black tabular-nums text-emerald-400 mb-1">{found}/{words.length}</p>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">words found</p>
        <p className="text-sm text-slate-400 mb-8">{accuracy}% of your lines were words</p>
        <div className="flex gap-3">
          <button onClick={loadRun} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-2xl font-bold">Play again</button>
          <button onClick={onDone} className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-2xl font-bold">Continue</button>
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

  return (
    <div className="h-full bg-slate-900 flex flex-col font-sans relative overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center gap-3 shrink-0">
        <button onClick={onExit} className="p-2 -ml-2 text-slate-400 hover:text-white rounded-full shrink-0">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold leading-tight truncate">Word Search</p>
          <p className="text-slate-500 text-xs">{unitTitle}</p>
        </div>
        <div className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl font-black text-emerald-400 tabular-nums text-sm shrink-0">
          {foundIds.length}/{words.length}
        </div>
      </div>

      <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
        {words.map((w, i) => {
          const found = foundIds.includes(w.id);
          return (
            <span
              key={w.id}
              className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                found
                  ? `${trailFor(i)} border-transparent line-through opacity-70`
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {w.word}
            </span>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center p-3">
        <div
          className="grid gap-1 w-full max-w-sm"
          style={{ gridTemplateColumns: `repeat(${grid.size}, minmax(0, 1fr))` }}
        >
          {grid.cells.map((row, r) =>
            row.map((letter, c) => {
              const key = `${r}-${c}`;
              const trail = foundTrail.get(key);
              const isAnchor = anchor?.row === r && anchor?.col === c;
              const isWrong = wrongCells.includes(key);
              const cls = trail
                ? trail
                : isAnchor
                  ? 'bg-emerald-500 text-white scale-105'
                  : isWrong
                    ? 'bg-rose-500/80 text-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700';
              return (
                <button
                  key={key}
                  onClick={() => handleCell({ row: r, col: c })}
                  className={`aspect-square rounded-lg font-mono font-black text-sm sm:text-base flex items-center justify-center transition-all duration-150 ${cls}`}
                >
                  {letter}
                </button>
              );
            }),
          )}
        </div>
      </div>

      <p className="pb-4 text-center text-slate-500 text-xs font-bold shrink-0">
        {anchor ? 'Now tap the last letter' : 'Tap the first letter of a word'}
      </p>
    </div>
  );
};

export default WordSearchStep;
