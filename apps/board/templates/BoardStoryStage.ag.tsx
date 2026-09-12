// BoardStoryStage.ag.tsx — Story Stage board redesign (Anti-Gravity version)
// Reading Theater state rebuilt directly from Stitch HTML design
// (docs/audit/games-v3/stitch/07-story-stage/1-reading-theater.html).
// Preserves all game lifecycle, scoring, remote actions, and pool coordination verbatim.
// Supports multi-character speech bubbles: spreads multiple character dialogues
// into distinct interactive speaker cards with individual audio playback.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, BookOpen, Check, ArrowRight, Quote } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { getVocabulary, getStory, getCharacters } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { playCue } from './playCue';
import { usePickedStudent } from './usePickedStudent';
import { useBoardPool } from '../useBoardPool';
import { logAttempt } from './scoreAttempt';
import { supabase } from '../../../services/supabaseClient';
import type { PoolItem } from '../../../types/exercise';

// ── Session-scoped coordination with BoardStorySequencing ──────────────
// Whichever of the two shells runs first in a lesson claims items; the second
// automatically avoids repeats. Module-level singleton — both templates share
// the same JS bundle in the board React root.
const askedComprehensionItems = new Map<string, Set<string>>();

/** Mark pool items as asked (called after presenting a question). */
export function markComprehensionAsked(objectiveId: string, itemIds: string[]) {
  const set = askedComprehensionItems.get(objectiveId) ?? new Set<string>();
  for (const id of itemIds) set.add(id);
  askedComprehensionItems.set(objectiveId, set);
}

/** Get pool items not yet asked in this session. */
export function getUnaskedComprehension(allItems: PoolItem[]): PoolItem[] {
  return allItems.filter(i => {
    const asked = askedComprehensionItems.get(i.objective_id);
    return !asked || !asked.has(i.id);
  });
}

/** Clear the session-scoped asked-set (called by endSession on session end). */
export function resetAskedComprehensionItems(): void {
  askedComprehensionItems.clear();
}

// ── Constants ──────────────────────────────────────────────────────────
const MAX_COMPREHENSION_QUESTIONS = 4;
const FALLBACK_COLORS = ['#EF4444', '#3B82F6', '#22C55E', '#F59E0B', '#A855F7', '#EC4899'];

// ── Dialogue parsing helper ────────────────────────────────────────────
export interface ParsedDialogueLine {
  speaker: string;
  text: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse page text into separate dialogue lines when a page represents a comic
 * panel with multiple speech bubbles or distinct character speech turns.
 */
export function parseDialogueLines(
  rawText: string | undefined,
  defaultSpeaker: string | undefined,
  characters: any[] = []
): ParsedDialogueLine[] {
  if (!rawText) return [];
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // 1. Separate into raw chunks: either by newline or by inline speaker markers
  let rawChunks: string[] = [];
  if (trimmed.includes('\n')) {
    rawChunks = trimmed.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
  } else {
    // If no newlines, check for multiple known character names followed by colon
    const knownNames = characters
      .map(c => String(c.name || '').trim())
      .filter(n => n.length > 0);

    let foundInline = false;
    if (knownNames.length > 0) {
      const namesPattern = knownNames.map(escapeRegExp).join('|');
      const inlineNamedRegex = new RegExp(`(?:^|\\s+)(${namesPattern})\\s*[:：]\\s*`, 'gi');
      const matches = Array.from(trimmed.matchAll(inlineNamedRegex));
      if (matches.length > 1) {
        const indices = matches.map(m => m.index!);
        for (let i = 0; i < matches.length; i++) {
          const start = indices[i];
          const end = i + 1 < matches.length ? indices[i + 1] : trimmed.length;
          rawChunks.push(trimmed.slice(start, end).trim());
        }
        foundInline = true;
      }
    }

    // Generic fallback for inline capitalized speakers if known names didn't match
    if (!foundInline) {
      const genericSpeakerRegex = /(?:^|\s+)([A-Za-z0-9\s_'-]{2,25})\s*[:：]\s*/g;
      const matches = Array.from(trimmed.matchAll(genericSpeakerRegex));
      if (matches.length > 1) {
        const indices = matches.map(m => m.index!);
        for (let i = 0; i < matches.length; i++) {
          const start = indices[i];
          const end = i + 1 < matches.length ? indices[i + 1] : trimmed.length;
          rawChunks.push(trimmed.slice(start, end).trim());
        }
      } else {
        rawChunks = [trimmed];
      }
    }
  }

  // 2. Parse each chunk into { speaker, text }
  return rawChunks.map((chunk, idx) => {
    // Match "Speaker: Dialogue"
    const colonMatch = chunk.match(/^([^:：\r\n]{1,35})[:：]\s*(.+)$/s);
    if (colonMatch) {
      const sName = colonMatch[1].trim();
      const dText = colonMatch[2].trim().replace(/^["“](.*)["”]$/s, '$1');
      return {
        speaker: sName,
        text: dText || chunk,
      };
    }

    // Match "[Speaker] Dialogue" or "(Speaker) Dialogue"
    const bracketMatch = chunk.match(/^[\[\(]([A-Za-z0-9\s_'-]{1,30})[\]\)]\s*[:：]?\s*(.+)$/s);
    if (bracketMatch) {
      const sName = bracketMatch[1].trim();
      const dText = bracketMatch[2].trim().replace(/^["“](.*)["”]$/s, '$1');
      return {
        speaker: sName,
        text: dText || chunk,
      };
    }

    // Fallback: if multiple chunks, attribute to cast members in turn; otherwise defaultSpeaker
    let fallbackSpeaker = defaultSpeaker || 'Narrator';
    if (rawChunks.length > 1 && characters.length > 0) {
      fallbackSpeaker = characters[idx % characters.length]?.name || fallbackSpeaker;
    }
    const cleanText = chunk.replace(/^["“](.*)["”]$/s, '$1');
    return {
      speaker: fallbackSpeaker,
      text: cleanText,
    };
  });
}

// ── Component ──────────────────────────────────────────────────────────
const BoardStoryStage = ({ data }: { data: any }) => {
  const { state, triggerAction, addPoints, pushToRemediation, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // ── Story objective lookup (same pattern as StorySequencing B1 fix) ──
  const [storyObjectiveId, setStoryObjectiveId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!unitId) { setStoryObjectiveId(null); return; }
    (async () => {
      const { data: rows, error } = await supabase
        .from('objectives').select('id').eq('unit_id', unitId).eq('type', 'story').limit(1);
      if (cancelled) return;
      setStoryObjectiveId(!error && rows?.length > 0 ? String(rows[0].id) : null);
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  // ── Pool: STORY_COMPREHENSION items ──────────────────────────────────
  const { items: poolItems } = useBoardPool({
    unitId, exerciseTypes: ['STORY_COMPREHENSION'], classWeak: true, roster, limit: 20,
  });

  const comprehensionItems = useMemo(() => {
    const unasked = getUnaskedComprehension(poolItems);
    const seen = new Set<string>();
    const out: PoolItem[] = [];
    for (const it of unasked) {
      if (it.exercise_type !== 'STORY_COMPREHENSION' || seen.has(it.id)) continue;
      const c = it.content as any;
      if (!c?.prompt || !Array.isArray(c.options) || c.options.length < 2) continue;
      if (typeof c.correct_index !== 'number') continue;
      seen.add(it.id);
      out.push(it);
      if (out.length >= MAX_COMPREHENSION_QUESTIONS) break;
    }
    return out;
  }, [poolItems]);

  // Helper to extract image URL from any known property variant (including book crops/cutouts)
  const resolvePageImageUrl = useCallback((p: any): string | undefined => {
    if (!p) return undefined;
    const url =
      p.imageUrl ||
      p.image_url ||
      p.image ||
      p.image_url_book_crop ||
      p.cropUrl ||
      p.crop_url ||
      p.url ||
      undefined;
    return typeof url === 'string' && url.trim().length > 0 ? url : undefined;
  }, []);

  // ── Character portraits (live bundle first, frozen plan fallback) ────
  const liveChars = useMemo(() => getCharacters(state.activeUnit?.manifest) || [], [state.activeUnit?.manifest]);
  const characters = useMemo(() => {
    if (Array.isArray(data?.characters) && data.characters.length > 0) return data.characters;
    if (liveChars.length > 0) return liveChars;
    const manifestChars = (state.activeUnit?.manifest as any)?.characters;
    if (Array.isArray(manifestChars) && manifestChars.length > 0) return manifestChars;
    return [];
  }, [data?.characters, liveChars, state.activeUnit?.manifest]);

  const charByName = useMemo(() => new Map<string, any>(characters.map((c: any) => [String(c.name || '').toLowerCase(), c])), [characters]);
  const portraitOf = (c: any, name?: string) => {
    const found = charByName.get(String(name || c?.name || '').toLowerCase());
    return found?.image_url || found?.imageUrl || c?.imageUrl || c?.image_url || null;
  };

  // ── Live-screen asset recovery: fetch relational bundle or story_pages if images missing ──
  const [dbPages, setDbPages] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!unitId) return;

    (async () => {
      // 1. Try get_unit_bundle RPC (attaches _relational so all normalizers work)
      try {
        const { data: bundle } = await supabase.rpc('get_unit_bundle', { p_unit_id: unitId });
        if (cancelled) return;
        if (bundle && Array.isArray(bundle.story_pages) && bundle.story_pages.length > 0) {
          if (state.activeUnit?.manifest && !(state.activeUnit.manifest as any)._relational) {
            try {
              Object.defineProperty(state.activeUnit.manifest, '_relational', {
                value: bundle,
                enumerable: false,
                configurable: true,
              });
            } catch {
              (state.activeUnit.manifest as any)._relational = bundle;
            }
          }
          setDbPages(bundle.story_pages);
          return;
        }
      } catch {
        // Fallback to direct query if RPC unavailable
      }

      // 2. Direct query to story_pages joining assets table
      try {
        const { data: rows } = await supabase
          .from('story_pages')
          .select('id, page_number, text, speaker, image_asset_id, assets:image_asset_id(public_url)')
          .eq('unit_id', unitId)
          .order('page_number');
        if (cancelled) return;
        if (rows && rows.length > 0) {
          setDbPages(
            rows.map((r: any) => ({
              text: r.text,
              speaker: r.speaker,
              imageUrl: r.assets?.public_url || undefined,
              image_url: r.assets?.public_url || undefined,
            }))
          );
        }
      } catch {
        // Best-effort
      }
    })();

    return () => { cancelled = true; };
  }, [unitId, state.activeUnit]);

  // ── Story pages (relational first, frozen fallback, merged with asset resolution) ──
  // CONTENT GROUPS (spec 2026-09-13): a tagged story block scopes the
  // relational read + the flow-step lookup to ITS story — a multi-story unit
  // no longer concatenates every page into one story.
  const relPages = useMemo(
    () => getStory(state.activeUnit?.manifest, Array.isArray(data?.structure_ids) ? data.structure_ids : null).pages || [],
    [state.activeUnit?.manifest, data?.structure_ids?.join(',')],
  );
  const flowPages = useMemo(() => {
    const flow = state.activeUnit?.flow || [];
    const storyStep = flow.find(
      (s: any) =>
        (s.type === 'STORY_STAGE' || s.type === 'STORY_STAGE_AG') &&
        Array.isArray(s.data?.pages) &&
        s.data.pages.length > 0 &&
        (data?.group_id ? s.data?.group_id === data.group_id : true)
    );
    return storyStep?.data?.pages || [];
  }, [state.activeUnit?.flow, data?.group_id]);

  const dataPages = useMemo(() => (Array.isArray(data?.pages) ? data.pages : []), [data?.pages]);

  const pages = useMemo(() => {
    const baseList =
      (relPages.length > 0 ? relPages : null) ||
      (flowPages.length > 0 ? flowPages : null) ||
      (dataPages.length > 0 ? dataPages : null) ||
      (dbPages.length > 0 ? dbPages : []) ||
      [];

    return baseList.map((p: any, idx: number) => {
      const rel = relPages[idx] || {};
      const flow = flowPages[idx] || {};
      const dt = dataPages[idx] || {};
      const db = dbPages[idx] || {};

      const text = p.text || rel.text || flow.text || dt.text || db.text || '';
      const speaker = p.speaker || rel.speaker || flow.speaker || dt.speaker || db.speaker;
      const audio = (p as any)?.audio || (p as any)?.audio_url || (rel as any)?.audio || (rel as any)?.audio_url || flow.audio || dt.audio || db.audio;

      const img =
        resolvePageImageUrl(p) ||
        resolvePageImageUrl(rel) ||
        resolvePageImageUrl(flow) ||
        resolvePageImageUrl(dt) ||
        resolvePageImageUrl(db);

      return {
        ...dt,
        ...flow,
        ...rel,
        ...db,
        ...p,
        text,
        speaker,
        audio,
        imageUrl: img,
        image_url: img,
      };
    });
  }, [relPages, flowPages, dataPages, dbPages, resolvePageImageUrl]);

  // ── Vocab for highlighting target words ──────────────────────────────
  const vocab = useMemo(() => getVocabulary(state.activeUnit?.manifest), [state.activeUnit?.manifest]);
  const vocabMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of vocab) if (v.word) m.set(v.word.toLowerCase(), v);
    return m;
  }, [vocab]);

  // ── Stage tracking ───────────────────────────────────────────────────
  // -1 = hook, 0..N-1 = pages, N = "The End" card, N+1..N+Q = comprehension, done
  const [activePanel, setActivePanel] = useState(-1);
  const [qIndex, setQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [alreadyScoredChip, setAlreadyScoredChip] = useState(false);
  const [slideDone, setSlideDone] = useState(false);
  // 2nd-miss comprehension reveal: correct option amber-ringed + explanation.
  const [revealedAnswer, setRevealedAnswer] = useState(false);

  // Active dialogue line index within the current page (for comic panels with multiple bubbles)
  const [activeLineIdx, setActiveLineIdx] = useState(0);

  // ── Lifecycle refs (the 4 must-dos) ──────────────────────────────────
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const streakRef = useRef(0);

  const totalContentPanels = pages.length;
  const hasComprehension = comprehensionItems.length > 0;
  const endCardPanel = totalContentPanels; // index of "The End" card

  const isHook = activePanel === -1;
  const isPage = activePanel >= 0 && activePanel < totalContentPanels;
  const isEndCard = activePanel === endCardPanel;
  const isComprehension = activePanel > endCardPanel && !slideDone;
  const current = isPage ? pages[activePanel] : null;

  // Resolves story image URL from any known key (imageUrl, image_url, image_url_book_crop, etc.)
  const currentImageUrl = useMemo(() => {
    if (!current) return undefined;
    return (
      resolvePageImageUrl(current) ||
      resolvePageImageUrl(dataPages[activePanel]) ||
      resolvePageImageUrl(flowPages[activePanel]) ||
      resolvePageImageUrl(dbPages[activePanel]) ||
      undefined
    );
  }, [current, dataPages, flowPages, dbPages, activePanel, resolvePageImageUrl]);

  // Reset activeLineIdx when navigating between pages
  useEffect(() => {
    setActiveLineIdx(0);
  }, [activePanel]);

  // ── Parse page dialogue lines (splits multiple speech bubbles) ───────
  const parsedLines = useMemo(() => {
    return parseDialogueLines(current?.text, current?.speaker, characters);
  }, [current?.text, current?.speaker, characters]);

  const activeLine = parsedLines[activeLineIdx] || parsedLines[0] || {
    speaker: current?.speaker || 'Narrator',
    text: current?.text || '',
  };

  const defaultSpeakerChar = current ? (characters.find((c: any) => c.name === current.speaker) || characters[0]) : null;
  const activeSpeakerName = activeLine.speaker || current?.speaker || defaultSpeakerChar?.name || 'Narrator';
  const activeSpeakerChar = characters.find((c: any) => c.name?.toLowerCase() === activeSpeakerName.toLowerCase()) || defaultSpeakerChar;
  const activeSpeakerPortrait = portraitOf(activeSpeakerChar, activeSpeakerName);

  // ── Character color lookup ───────────────────────────────────────────
  const getCharColor = (name: string) => {
    const idx = characters.findIndex((c: any) => c.name?.toLowerCase() === name?.toLowerCase());
    if (idx >= 0 && characters[idx]?.color) return characters[idx].color;
    return FALLBACK_COLORS[idx >= 0 ? idx % FALLBACK_COLORS.length : 0];
  };

  const activeSpeakerColor = getCharColor(activeSpeakerName);

  // ── Dual-write helper ────────────────────────────────────────────────
  const doDualWrite = useCallback((opts: {
    correctness: 'correct' | 'incorrect' | 'partial';
    points: number;
    objectiveId: string | null;
    exerciseType: string;
    difficulty: number;
    passed: boolean;
  }) => {
    const picked = state.quickWheelWinner;
    if (!picked) return;
    if (opts.points !== 0) addPoints(picked, opts.points);
    logAttempt({
      state, picked, unitId,
      objectiveId: opts.objectiveId ?? undefined,
      exerciseType: opts.exerciseType,
      difficulty: opts.difficulty,
      correctness: opts.correctness,
      correct: opts.passed,
      modality: 'receptive',
      pushToRemediation,
    });
  }, [state.quickWheelWinner, state.students, state.activeClassId, addPoints, unitId, pushToRemediation]);

  const showAlreadyScored = useCallback(() => {
    setAlreadyScoredChip(true);
    setTimeout(() => setAlreadyScoredChip(false), 1500);
  }, []);

  // ── Question advancement ─────────────────────────────────────────────
  const advanceQuestion = useCallback((idx: number) => {
    const currentItem = comprehensionItems[idx];
    if (currentItem) {
      markComprehensionAsked(currentItem.objective_id, [currentItem.id]);
    }
    if (idx + 1 >= comprehensionItems.length) {
      playCue('win');
      setSlideDone(true);
      setTimeout(() => triggerAction('SLIDE_COMPLETE', { forced: false }), 2000);
    } else {
      setQIndex(idx + 1);
      setSelectedOption(null);
      setEliminatedOptions([]);
      setRevealedAnswer(false);
      mistakesRef.current = 0;
      awardedRef.current = false;
    }
  }, [comprehensionItems, triggerAction]);

  // ── Comprehension MCQ handler ────────────────────────────────────────
  const handleOptionTap = useCallback((optIndex: number) => {
    const item = comprehensionItems[qIndex];
    if (!item || selectedOption !== null) return;
    const c = item.content as any;
    const correctIndex = Number(c.correct_index);
    setSelectedOption(optIndex);
    const objectiveId = item.objective_id || storyObjectiveId;
    const correct = optIndex === correctIndex;

    if (correct) {
      if (awardedRef.current) { showAlreadyScored(); return; }
      awardedRef.current = true;
      playCue('correct');
      streakRef.current += 1;
      if (streakRef.current === 3 || streakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      const points = scoreForAttempt(mistakesRef.current, item.difficulty, 1.0, streakRef.current);
      doDualWrite({
        correctness: 'correct', points, objectiveId,
        exerciseType: 'STORY_COMPREHENSION', difficulty: item.difficulty, passed: true,
      });
      setTimeout(() => advanceQuestion(qIndex), 900);
    } else {
      mistakesRef.current += 1;
      streakRef.current = 0;
      doDualWrite({
        correctness: 'incorrect', points: -MISTAKE_PENALTY, objectiveId,
        exerciseType: 'STORY_COMPREHENSION', difficulty: item.difficulty, passed: false,
      });
      setEliminatedOptions(prev => {
        const next = prev.includes(optIndex) ? prev : [...prev, optIndex];
        if (mistakesRef.current === 1) {
          const extra = Array.from({ length: c.options.length }, (_, i) => i)
            .find(i => i !== correctIndex && !next.includes(i));
          return extra !== undefined ? [...next, extra] : next;
        }
        return next;
      });
      if (mistakesRef.current >= 2) {
        playCue('reveal');
        setRevealedAnswer(true);
        setTimeout(() => {
          setRevealedAnswer(false);
          advanceQuestion(qIndex);
        }, 2200);
      } else {
        playCue('wrong');
        setTimeout(() => setSelectedOption(null), 900);
      }
    }
  }, [comprehensionItems, qIndex, selectedOption, storyObjectiveId, doDualWrite, advanceQuestion, showAlreadyScored, triggerConfetti]);

  // ── Local panel nav ──────────────────────────────────────────────────
  const nextPanel = () => setActivePanel(p => {
    if (p < totalContentPanels) return p + 1;
    if (p === totalContentPanels && hasComprehension) return p + 1;
    return p;
  });
  const prevPanel = () => setActivePanel(p => Math.max(p - 1, -1));

  // Step line-by-line within a page, or advance page when all lines read
  const handleNext = () => {
    if (isPage && parsedLines.length > 1 && activeLineIdx < parsedLines.length - 1) {
      const nextIdx = activeLineIdx + 1;
      setActiveLineIdx(nextIdx);
      playAudioUrl(undefined, parsedLines[nextIdx].text);
    } else {
      nextPanel();
    }
  };

  const handlePrev = () => {
    if (isPage && parsedLines.length > 1 && activeLineIdx > 0) {
      const prevIdx = activeLineIdx - 1;
      setActiveLineIdx(prevIdx);
      playAudioUrl(undefined, parsedLines[prevIdx].text);
    } else {
      prevPanel();
    }
  };

  // ── Remote/commander action listener ─────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    switch (a.type) {
      case 'NEXT_PANEL':
      case 'NEXT_CARD':
        if (isPage && parsedLines.length > 1 && activeLineIdx < parsedLines.length - 1) {
          const nextIdx = activeLineIdx + 1;
          setActiveLineIdx(nextIdx);
          playAudioUrl(undefined, parsedLines[nextIdx].text);
        } else {
          setActivePanel(p => {
            if (p < totalContentPanels) return p + 1;
            if (p === totalContentPanels && hasComprehension) return p + 1;
            return p;
          });
        }
        break;
      case 'PREV_PANEL':
      case 'PREV_CARD':
        if (isPage && parsedLines.length > 1 && activeLineIdx > 0) {
          const prevIdx = activeLineIdx - 1;
          setActiveLineIdx(prevIdx);
          playAudioUrl(undefined, parsedLines[prevIdx].text);
        } else {
          setActivePanel(p => Math.max(p - 1, -1));
        }
        break;
      case 'PLAY_AUDIO':
        if (isPage) {
          const audioUrl = parsedLines.length === 1 ? current?.audio : undefined;
          playAudioUrl(audioUrl, activeLine.text);
        }
        break;
      case 'RESET_GAME':
        setActivePanel(-1);
        setQIndex(0);
        setSelectedOption(null);
        setEliminatedOptions([]);
        setRevealedAnswer(false);
        setSlideDone(false);
        setActiveLineIdx(0);
        mistakesRef.current = 0;
        awardedRef.current = false;
        streakRef.current = 0;
        break;
      case 'REVEAL_HINT':
        if (selectedOption !== null || !hasComprehension) break;
        {
          const item = comprehensionItems[qIndex];
          if (item) {
            const c = item.content as any;
            const correctIndex = Number(c.correct_index);
            setEliminatedOptions(prev => {
              const idx = Array.from({ length: c.options.length }, (_, i) => i)
                .find(i => i !== correctIndex && !prev.includes(i));
              return idx === undefined ? prev : [...prev, idx];
            });
          }
        }
        break;
      case 'MARK_CORRECT':
        if (awardedRef.current) { showAlreadyScored(); break; }
        awardedRef.current = true;
        {
          const item = comprehensionItems[qIndex];
          if (item) {
            playCue('correct');
            streakRef.current += 1;
            if (streakRef.current === 3 || streakRef.current === 5) {
              playCue('streak');
              triggerConfetti();
            }
            const points = scoreForAttempt(mistakesRef.current, item.difficulty, 1.0, streakRef.current);
            doDualWrite({
              correctness: 'correct', points,
              objectiveId: item.objective_id || storyObjectiveId,
              exerciseType: 'STORY_COMPREHENSION', difficulty: item.difficulty, passed: true,
            });
            setTimeout(() => advanceQuestion(qIndex), 900);
          }
        }
        break;
      case 'SKIP_ROUND':
      case 'NEXT_ROUND':
        advanceQuestion(qIndex);
        break;
      case 'SLIDE_COMPLETE':
        setSlideDone(true);
        break;
    }
    // eslint-disable-next-line
  }, [state.lastAction, isPage, parsedLines, activeLineIdx, totalContentPanels, hasComprehension]);

  // ── Game-lifecycle: new turn → fresh refs ────────────────────────────
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    streakRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  useEffect(() => {
    if (!slideDone) return;
    const t = setTimeout(() => setSlideDone(false), 6000);
    return () => clearTimeout(t);
  }, [slideDone]);

  // ── Render target words highlighted in dialogue ──────────────────────
  const renderText = (text: string) =>
    (text || '').split(/(\s+)/).map((tok, i) => {
      const cleaned = tok.replace(/[^a-zA-Z']/g, '').toLowerCase();
      const v = vocabMap.get(cleaned);
      if (v && cleaned) {
        return (
          <span
            key={i}
            className="font-bold text-[#10B981] underline decoration-[#10B981]/50 underline-offset-8"
          >
            {tok}
          </span>
        );
      }
      return <span key={i}>{tok}</span>;
    });

  // ── Empty state ──────────────────────────────────────────────────────
  if (pages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <BookOpen size={56} className="text-amber-600/40 mb-3" />
        <p className="font-display text-3xl font-bold">Story Stage</p>
        <p className="text-lg mt-2">No story pages for this unit.</p>
      </div>
    );
  }

  const currentQuestion = isComprehension ? comprehensionItems[qIndex] : null;

  return (
    <div className="h-full relative overflow-hidden">
      <AnimatePresence mode="wait">
        {/* ═══ STORY HOOK (title card, panel -1) ═══ */}
        {isHook && (
          <motion.div
            key="hook"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(160deg, #3A2A16, #1F1408)' }}
          >
            <motion.div initial={{ y: 20 }} animate={{ y: 0 }} transition={{ delay: 0.2 }} className="text-center">
              <div className="text-4xl mb-3">📖</div>
              <h1
                className="font-display text-6xl font-black text-amber-300 mb-2"
                style={{ textShadow: '0 4px 20px rgba(217,119,6,.3)' }}
              >
                {data.title || 'Story'}
              </h1>
              {data.setting && <p className="font-cn text-xl text-amber-400/50 mb-6">{data.setting}</p>}
            </motion.div>
            {characters.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex gap-6">
                {characters.map((c: any, i: number) => {
                  const portrait = portraitOf(c);
                  return (
                    <div key={i} className="flex flex-col items-center">
                      {portrait ? (
                        <img src={portrait} alt={c.name} className="w-16 h-16 rounded-full object-cover mb-1" />
                      ) : (
                        <div
                          className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-1"
                          style={{
                            border: `3px solid ${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}`,
                            background: `${FALLBACK_COLORS[i % FALLBACK_COLORS.length]}20`,
                          }}
                        >
                          {c.emoji || c.name?.charAt(0) || '👤'}
                        </div>
                      )}
                      <span className="font-display text-sm font-bold text-slate-300">{c.name}</span>
                    </div>
                  );
                })}
              </motion.div>
            )}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-6">
              <span className="text-sm text-amber-400/40">👆 Teacher: tap Next to begin · 点击下一步开始</span>
            </motion.div>
          </motion.div>
        )}

        {/* ═══ STORY PAGE — Reading Theater from Stitch 1-reading-theater.html ═══ */}
        {isPage && current && (
          <motion.div
            key={`page-${activePanel}`}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex flex-col justify-between p-2 sm:p-4 lg:p-6 bg-[#070C18] ag-grid relative box-border overflow-hidden select-none"
          >
            <style>{`
              .ag-grid {
                background-size: 36px 36px;
                background-image:
                  linear-gradient(to right, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
              }
              .ag-font-display { font-family: 'Fredoka', 'Sora', sans-serif; }
              .ag-font-sora { font-family: 'Sora', sans-serif; }
              .ag-font-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
              .ag-dialogue-glow {
                text-shadow: 0 2px 14px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 255, 255, 0.12);
              }
            `}</style>

            {/* TOP BAR (16:9 Projector Safe Area: starts pl-40 lg:pl-48 to clear BoardShell's phase pill) */}
            <header className="w-full flex items-center justify-between gap-3 pl-40 lg:pl-48 pr-1 h-10 sm:h-12 lg:h-14 z-20 shrink-0">
              {/* Left Section: App / Activity Title */}
              <div className="flex items-center gap-2.5 lg:gap-3 min-w-0">
                <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-[#FF2E79] flex items-center justify-center ag-font-display font-bold text-white text-base lg:text-xl shadow-[0_0_16px_rgba(255,46,121,0.5)] shrink-0">
                  S
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="ag-font-display text-lg sm:text-xl lg:text-2xl font-bold tracking-wide text-white truncate">
                      Story Stage
                    </h1>
                    <span className="px-2 py-0.5 rounded bg-[#16234D] border border-white/10 ag-font-mono text-[10px] lg:text-[11px] font-bold text-slate-300 shrink-0">
                      READING THEATER
                    </span>
                  </div>
                  <p className="ag-font-mono text-[9px] lg:text-[10px] text-slate-400 tracking-wider truncate uppercase">
                    {data.title ? `CHAPTER · ${data.title}` : 'STORY READING'}
                  </p>
                </div>
              </div>

              {/* Center/Right Status Chips */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0B132B] border border-white/10">
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
                  <span className="ag-font-mono text-[10px] sm:text-xs text-slate-300">
                    {pickedStudent ? (
                      <>Turn: <strong className="text-white font-bold">{pickedStudent.name}</strong></>
                    ) : (
                      <>Chorus Mode: <strong className="text-white font-bold">Repeat Together</strong></>
                    )}
                  </span>
                </div>
              </div>
            </header>

            {/* MAIN STAGE: TWO-COLUMN 16:9 VIEWPORT (LEFT 38% / RIGHT 62%) */}
            <main className="w-full flex-1 min-h-0 flex flex-col sm:flex-row gap-2 sm:gap-4 lg:gap-6 my-1 sm:my-2 lg:my-4 overflow-hidden items-stretch">
              {/* LEFT COLUMN (~38%): HIGH-CONTRAST READING THEATER */}
              <section className="sm:w-[38%] flex flex-col justify-between bg-[#0B132B] border border-white/10 rounded-2xl p-3 sm:p-5 lg:p-7 relative shadow-2xl overflow-hidden min-h-0">
                {/* Top Section: Speaker Identity & Role */}
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 sm:pb-3 lg:pb-5 gap-2 shrink-0">
                  <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                    {/* Active Speaker's Round Avatar with Signature Color Halo */}
                    <div className="relative shrink-0">
                      <div
                        className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-full p-0.5 shadow-[0_0_18px_rgba(251,191,36,0.35)] transition-transform duration-300"
                        style={{
                          background: `linear-gradient(to top right, ${activeSpeakerColor}, #F59E0B, #FDE68A)`,
                          boxShadow: `0 0 18px ${activeSpeakerColor}55`,
                        }}
                      >
                        <div className="w-full h-full rounded-full bg-[#111C3D] flex items-center justify-center overflow-hidden border-2 border-[#070C18]">
                          {activeSpeakerPortrait ? (
                            <img
                              src={activeSpeakerPortrait}
                              alt={activeSpeakerName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-lg sm:text-xl lg:text-3xl">
                              {activeSpeakerChar?.emoji || activeSpeakerName.charAt(0) || '👤'}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Speaking Pulse Pill */}
                      <span className="absolute -bottom-0.5 -right-0.5 lg:-bottom-1 lg:-right-1 flex h-3.5 w-3.5 lg:h-4 lg:w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 lg:h-4 lg:w-4 bg-[#10B981] border-2 border-[#070C18]"></span>
                      </span>
                    </div>

                    <div className="min-w-0">
                      <span className="ag-font-mono text-[9px] lg:text-xs uppercase tracking-widest text-slate-400 font-semibold block leading-tight">
                        SPEAKING NOW
                      </span>
                      <div className="flex items-center gap-2">
                        <h2
                          className="ag-font-display text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold tracking-wide truncate leading-tight"
                          style={{ color: activeSpeakerColor }}
                        >
                          {activeSpeakerName.toUpperCase()}
                        </h2>
                        <span
                          className="hidden md:inline-block px-2 py-0.5 rounded ag-font-mono text-[9px] lg:text-[10px] font-bold border"
                          style={{
                            backgroundColor: `${activeSpeakerColor}1A`,
                            color: activeSpeakerColor,
                            borderColor: `${activeSpeakerColor}4D`,
                          }}
                        >
                          VOICE
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dialogue / Turn Tag */}
                  <div className="px-2 sm:px-2.5 lg:px-3 py-1 bg-[#111C3D] border border-white/10 rounded-lg shrink-0">
                    <span className="ag-font-mono text-[9px] sm:text-[10px] lg:text-xs text-slate-300 font-bold">
                      {parsedLines.length > 1
                        ? `LINE ${activePanel + 1} · TURN ${activeLineIdx + 1}/${parsedLines.length}`
                        : `LINE ${String(activePanel + 1).padStart(2, '0')} / ${String(totalContentPanels).padStart(2, '0')}`}
                    </span>
                  </div>
                </div>

                {/* Center Narrative Area: Multi-character Dialogue or Single Large Blockquote */}
                {parsedLines.length > 1 ? (
                  /* Multi-character dialogue: distinct speech cards with individual audio play on tap */
                  <div className="flex-1 min-h-0 flex flex-col justify-center py-1 sm:py-2 lg:py-3 overflow-hidden">
                    <div className="mb-2 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <Quote className="text-[#38BDF8] rotate-180 shrink-0" size={16} />
                        <span className="ag-font-mono text-[9px] sm:text-xs font-bold text-[#38BDF8] uppercase tracking-wider">
                          Dialogue ({parsedLines.length} Speakers)
                        </span>
                      </div>
                      <span className="ag-font-mono text-[9px] sm:text-[10px] text-slate-400">
                        Tap any character to listen
                      </span>
                    </div>

                    <div className="flex-1 min-h-0 space-y-2 sm:space-y-2.5 overflow-y-auto pr-1">
                      {parsedLines.map((line, idx) => {
                        const isSelected = idx === activeLineIdx;
                        const lineColor = getCharColor(line.speaker);
                        const lineChar = characters.find((c: any) => c.name?.toLowerCase() === line.speaker.toLowerCase());
                        const linePortrait = portraitOf(lineChar, line.speaker);

                        return (
                          <motion.div
                            key={idx}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => {
                              setActiveLineIdx(idx);
                              playAudioUrl(undefined, line.text);
                            }}
                            className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all cursor-pointer relative overflow-hidden ${
                              isSelected
                                ? 'bg-[#111C3D] border-[#38BDF8] shadow-[0_0_20px_rgba(56,189,248,0.25)] ring-2 ring-[#38BDF8]/20'
                                : 'bg-[#0E1733]/70 hover:bg-[#111C3D] border-white/10 hover:border-white/20'
                            }`}
                          >
                            {/* Left speaker accent bar */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-1.5"
                              style={{ backgroundColor: lineColor }}
                            />

                            <div className="flex items-start gap-2.5 pl-1.5">
                              {/* Mini avatar with colored halo */}
                              <div className="relative shrink-0 mt-0.5">
                                <div
                                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full p-0.5 flex items-center justify-center overflow-hidden"
                                  style={{
                                    background: `linear-gradient(to top right, ${lineColor}, #F59E0B)`,
                                    boxShadow: isSelected ? `0 0 12px ${lineColor}88` : undefined,
                                  }}
                                >
                                  <div className="w-full h-full rounded-full bg-[#070C18] flex items-center justify-center overflow-hidden">
                                    {linePortrait ? (
                                      <img src={linePortrait} alt={line.speaker} className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="text-xs sm:text-sm font-bold text-white">
                                        {lineChar?.emoji || line.speaker.charAt(0) || '👤'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {isSelected && (
                                  <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#10B981]"></span>
                                  </span>
                                )}
                              </div>

                              {/* Speaker Name + Spoken Text */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span
                                    className="ag-font-display text-xs sm:text-sm font-bold uppercase tracking-wide truncate"
                                    style={{ color: lineColor }}
                                  >
                                    {line.speaker}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-md flex items-center gap-1 text-[10px] font-bold ag-font-mono transition-colors ${
                                      isSelected
                                        ? 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/40'
                                        : 'bg-white/5 text-slate-400 border border-white/10'
                                    }`}
                                  >
                                    <Volume2 size={11} className={isSelected ? 'animate-pulse' : ''} />
                                    <span>{isSelected ? 'Now Reading' : 'Tap to Read'}</span>
                                  </span>
                                </div>

                                {/* Dialogue quote */}
                                <p
                                  className={`ag-font-display leading-snug tracking-tight ${
                                    parsedLines.length <= 2
                                      ? 'text-base sm:text-lg lg:text-2xl font-bold'
                                      : 'text-sm sm:text-base lg:text-lg font-bold'
                                  } ${isSelected ? 'text-white ag-dialogue-glow' : 'text-slate-200'}`}
                                >
                                  &ldquo;{renderText(line.text)}&rdquo;
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Single speaker narrative: extra large blockquote */
                  <div className="flex-1 min-h-0 flex flex-col justify-center py-2 sm:py-3 lg:py-6 overflow-hidden">
                    <div className="mb-1.5 sm:mb-2 lg:mb-3 flex items-center gap-2 shrink-0">
                      <Quote className="text-[#38BDF8] rotate-180 shrink-0" size={18} />
                      <span className="ag-font-mono text-[9px] sm:text-xs font-bold text-[#38BDF8] uppercase tracking-wider">
                        Target Speech Chant
                      </span>
                    </div>

                    <blockquote
                      onClick={() => {
                        const audioUrl = current.audio;
                        playAudioUrl(audioUrl, activeLine.text);
                      }}
                      className="ag-font-display text-[20px] sm:text-[24px] md:text-[30px] lg:text-[38px] xl:text-[44px] leading-[1.18] font-bold text-white ag-dialogue-glow tracking-tight select-text overflow-y-auto max-h-full cursor-pointer hover:text-sky-100 transition-colors"
                      title="Tap to read sentence"
                    >
                      &ldquo;{renderText(activeLine.text)}&rdquo;
                    </blockquote>
                  </div>
                )}

                {/* Bottom Controls: Sky Audio Replay Pill + Chunk Book-Page Progress Strip (28px dots) */}
                <div className="border-t border-white/10 pt-2 sm:pt-3 lg:pt-5 space-y-2 sm:space-y-3 lg:space-y-4 shrink-0">
                  {/* Sky Audio Pill to Replay Active Line */}
                  <button
                    type="button"
                    onClick={() => {
                      const audioUrl = parsedLines.length === 1 ? current.audio : undefined;
                      playAudioUrl(audioUrl, activeLine.text);
                    }}
                    className="w-full flex items-center justify-center gap-2 sm:gap-2.5 lg:gap-3 py-2 sm:py-2.5 lg:py-3.5 px-4 lg:px-6 rounded-xl bg-[#38BDF8]/15 border-2 border-[#38BDF8] text-[#38BDF8] ag-font-display text-sm sm:text-base lg:text-lg font-bold hover:bg-[#38BDF8] hover:text-[#070C18] transition-all shadow-[0_0_20px_rgba(56,189,248,0.22)] active:scale-[0.98]"
                  >
                    <Volume2 size={20} className="animate-pulse shrink-0" />
                    <span>
                      {parsedLines.length > 1
                        ? `REPLAY ${activeSpeakerName.toUpperCase()}'S LINE`
                        : 'REPLAY AUDIO LINE'}
                    </span>
                  </button>

                  {/* Book-Page Progress Strip with Chunky 28px Numbered Dots */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                      <span className="ag-font-mono text-[9px] sm:text-[10px] lg:text-xs text-slate-400 font-bold uppercase tracking-wider">
                        STORY PROGRESS (PAGE {activePanel + 1} OF {totalContentPanels})
                      </span>
                      <span className="ag-font-mono text-[9px] sm:text-[10px] lg:text-xs text-[#10B981] font-bold">
                        {Math.round(((activePanel + 1) / totalContentPanels) * 100)}% COMPLETED
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1 sm:gap-2 p-1.5 sm:p-2.5 lg:p-3 bg-[#111C3D] rounded-xl border border-white/5 overflow-x-auto">
                      {pages.map((_: any, i: number) => {
                        const isDone = i < activePanel;
                        const isActive = i === activePanel;
                        return (
                          <React.Fragment key={i}>
                            <div
                              className={`flex items-center justify-center rounded-full ag-font-mono text-[10px] sm:text-xs font-black shrink-0 transition-all ${
                                isDone
                                  ? 'w-6 h-6 sm:w-7 sm:h-7 min-w-[24px] sm:min-w-[28px] min-h-[24px] sm:min-h-[28px] bg-[#10B981] text-[#070C18] shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                                  : isActive
                                  ? 'w-6 h-6 sm:w-7 sm:h-7 min-w-[24px] sm:min-w-[28px] min-h-[24px] sm:min-h-[28px] bg-[#FF2E79] text-white shadow-[0_0_16px_rgba(255,46,121,0.6)] ring-4 ring-[#FF2E79]/25 animate-pulse'
                                  : 'w-6 h-6 sm:w-7 sm:h-7 min-w-[24px] sm:min-w-[28px] min-h-[24px] sm:min-h-[28px] bg-[#0B132B] border border-white/20 text-slate-400 font-bold'
                              }`}
                            >
                              {isDone ? '✓' : i + 1}
                            </div>
                            {i < pages.length - 1 && (
                              <div
                                className={`flex-1 h-1 min-w-[6px] rounded-full transition-colors ${
                                  isDone ? 'bg-[#10B981]/50' : 'bg-white/10'
                                }`}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              {/* RIGHT COLUMN (~62%): STORY ART STAGE (UNCROPPED OBJECT-CONTAIN) */}
              <section className="sm:w-[62%] flex-1 flex flex-col justify-between bg-[#0B132B] border border-white/10 rounded-2xl p-2 sm:p-4 lg:p-6 shadow-2xl relative overflow-hidden min-h-0">
                {/* Top Stage HUD Strip */}
                <div className="w-full flex items-center justify-between mb-2 sm:mb-3 lg:mb-4 px-1 sm:px-2 shrink-0">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="flex items-center gap-2 px-2.5 py-1 bg-[#111C3D] rounded-lg border border-white/10 shrink-0">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <span className="ag-font-mono text-[9px] sm:text-xs text-slate-300 font-bold uppercase truncate">
                        SCENE {String(activePanel + 1).padStart(2, '0')}{data.title ? `: ${data.title}` : ''}
                      </span>
                    </div>
                    <span className="ag-font-mono text-[9px] sm:text-xs text-slate-400 hidden md:inline-block">
                      Visual Clue #{String(activePanel + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <span className="ag-font-mono text-[9px] sm:text-xs text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg font-bold hidden sm:inline-block">
                      16:9 NATIVE VIEW
                    </span>
                    <span className="ag-font-mono text-[9px] sm:text-xs text-slate-400 bg-[#111C3D] px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg border border-white/10">
                      UNCROPPED
                    </span>
                  </div>
                </div>

                {/* Center Art Container: Clean Rounded Card with Full-Bleed Object-Contain (Never Cropped) */}
                <div
                  onClick={() => {
                    const audioUrl = parsedLines.length === 1 ? current.audio : undefined;
                    playAudioUrl(audioUrl, activeLine.text);
                  }}
                  className="flex-1 min-h-0 w-full bg-[#111C3D] border-2 border-white/10 rounded-xl flex items-center justify-center p-2 sm:p-3 relative overflow-hidden shadow-inner group cursor-pointer"
                  title="Click to replay active speaker"
                >
                  {/* Subtle Ambient Backlight Matching Savanna Artwork */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 via-transparent to-sky-500/10 pointer-events-none" />

                  {/* The Story Illustration: Full-bleed object-contain, crisp and never cropped */}
                  {currentImageUrl ? (
                    <img
                      src={currentImageUrl}
                      alt={activeSpeakerName || 'Story illustration'}
                      className="w-full h-full object-contain rounded-lg drop-shadow-[0_12px_28px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover:scale-[1.01]"
                      onError={(e) => {
                        console.warn('[BoardStoryStage] Story image failed to load:', currentImageUrl);
                        ((e.target as HTMLImageElement).style.opacity = '0');
                      }}
                    />
                  ) : (
                    <div
                      className="w-full h-full rounded-lg flex items-center justify-center"
                      style={{ background: 'linear-gradient(160deg, #3A2A16, #1F1408)' }}
                    >
                      <span className="ag-font-display font-bold text-2xl lg:text-4xl text-amber-300/70">
                        {data.title || 'Story'}
                      </span>
                    </div>
                  )}

                  {/* Non-intrusive Stage Watermark / Distance Anchor */}
                  <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 lg:bottom-6 lg:right-6 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-[#070C18]/85 backdrop-blur border border-white/15 rounded-lg flex items-center gap-1.5 sm:gap-2 shadow-lg pointer-events-none">
                    <span className="text-amber-400 text-xs sm:text-sm">👁️</span>
                    <span className="ag-font-mono text-[9px] sm:text-[11px] font-bold text-slate-200 uppercase tracking-wider truncate max-w-[140px] sm:max-w-[200px]">
                      {data.title || 'Story Stage'}
                    </span>
                  </div>
                </div>

                {/* Interactive Scene Guidance / Classroom Prompt (stripped mock Class Response Meter) */}
                <div className="mt-2 sm:mt-3 lg:mt-4 flex items-center justify-between px-1 sm:px-2 pt-1 shrink-0">
                  <div className="flex items-center gap-2 text-slate-300 min-w-0">
                    <span className="text-amber-400 text-sm sm:text-base shrink-0">💡</span>
                    <span className="ag-font-mono text-[9px] sm:text-xs text-slate-300 truncate">
                      <strong className="text-white">Teacher Cue:</strong>{' '}
                      {parsedLines.length > 1
                        ? `Speaking: ${activeSpeakerName}. Tap any character card on the left to read their sentence.`
                        : current.speaker
                        ? `Listen to ${current.speaker}, then repeat choral echo together.`
                        : 'Listen carefully, then repeat the sentence aloud.'}
                    </span>
                  </div>
                </div>
              </section>
            </main>

            {/* BOTTOM ACTION & NAVIGATION BAR */}
            <footer className="w-full flex items-center justify-between h-10 sm:h-12 lg:h-14 z-20 shrink-0 border-t border-white/10 pt-1.5 sm:pt-2 lg:pt-3">
              {/* Left Navigation Guidance */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[#0B132B] rounded-lg border border-white/10 text-slate-400 ag-font-mono text-xs">
                  <span className="font-bold text-slate-200">
                    {parsedLines.length > 1 ? `Line ${activePanel + 1}.${activeLineIdx + 1}` : `Line ${activePanel + 1}`}
                  </span>
                  <span>of</span>
                  <span className="font-bold text-slate-200">{totalContentPanels}</span>
                </div>
              </div>

              {/* Right Primary Action Cluster (Single Hot-Pink Primary) */}
              <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                {/* Secondary Back Action */}
                {(activePanel > 0 || (parsedLines.length > 1 && activeLineIdx > 0)) && (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="px-3 sm:px-4 lg:px-5 py-1.5 sm:py-2 lg:py-2.5 rounded-xl bg-[#0B132B] border border-white/15 text-slate-300 ag-font-display font-bold text-xs sm:text-sm hover:text-white hover:border-white/30 transition-all active:scale-95"
                  >
                    {parsedLines.length > 1 && activeLineIdx > 0
                      ? `Back to ${parsedLines[activeLineIdx - 1].speaker}`
                      : `Back to Line ${activePanel}`}
                  </button>
                )}

                {/* Hot Pink Single Primary Action: Next Line / Next Speaker */}
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-4 sm:px-6 lg:px-7 py-1.5 sm:py-2 lg:py-2.5 rounded-xl bg-[#FF2E79] text-white ag-font-display font-bold text-xs sm:text-sm lg:text-base hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,46,121,0.45)] flex items-center gap-1.5 sm:gap-2"
                >
                  <span>
                    {parsedLines.length > 1 && activeLineIdx < parsedLines.length - 1
                      ? `Next: ${parsedLines[activeLineIdx + 1].speaker}`
                      : activePanel + 1 < totalContentPanels
                      ? 'Next Line'
                      : hasComprehension
                      ? 'Comprehension Quiz →'
                      : 'Finish Story →'}
                  </span>
                  <ArrowRight size={18} className="shrink-0" />
                </button>
              </div>
            </footer>
          </motion.div>
        )}

        {/* ═══ THE END CARD (transitions to comprehension or complete) ═══ */}
        {isEndCard && (
          <motion.div
            key="end-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(160deg, #2A1F10, #1A1208)' }}
          >
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>
              <div className="text-5xl mb-4">📚</div>
            </motion.div>
            <h2 className="font-display text-5xl font-black text-amber-300 mb-2">The End</h2>
            <p className="font-cn text-2xl text-amber-400/50 mb-6">故事结束</p>
            {hasComprehension ? (
              <div className="px-6 py-3 rounded-full bg-amber-500/15 border border-amber-400/30">
                <span className="font-display text-lg font-bold text-amber-200">Comprehension Check →</span>
                <span className="font-cn text-sm text-amber-400/60 ml-2">理解检查</span>
              </div>
            ) : (
              <div className="px-6 py-3 rounded-full bg-amber-500/15 border border-amber-400/30">
                <span className="font-display text-lg font-bold text-amber-200">No comprehension questions available</span>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ COMPREHENSION MCQ ═══ */}
        {isComprehension && currentQuestion && (() => {
          const c = currentQuestion.content as any;
          const correctIndex = Number(c.correct_index);
          const resolved = selectedOption === correctIndex;
          return (
            <motion.div
              key={`comp-${qIndex}`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="absolute inset-0 flex flex-col items-center justify-center px-8"
              style={{ background: 'linear-gradient(160deg, #2A1F10, #1A1208)' }}
            >
              {/* Question header */}
              <div className="mb-4 flex items-center gap-3">
                <span className="bg-amber-500/20 text-amber-300 px-4 py-1 rounded-full text-sm font-bold">
                  Question {qIndex + 1} / {comprehensionItems.length}
                </span>
                {pickedStudent && (
                  <span className="bg-sky-500/20 text-sky-300 px-3 py-1 rounded-full text-sm font-bold">
                    {pickedStudent.name}
                  </span>
                )}
              </div>
              {/* Question prompt */}
              <div className="bg-white/10 backdrop-blur-md rounded-3xl px-10 py-6 max-w-3xl w-full mb-8 border border-amber-400/20">
                <p className="font-display text-3xl font-bold text-amber-50 text-center">{c.prompt}</p>
              </div>
              {/* Options */}
              <div className="grid grid-cols-2 gap-4 max-w-3xl w-full">
                {(c.options as string[]).map((opt, i) => {
                  const isCorrect = i === correctIndex;
                  const isSelected = selectedOption === i;
                  const isEliminated = eliminatedOptions.includes(i);
                  const showResult = selectedOption !== null;
                  return (
                    <button
                      key={i}
                      onClick={() => handleOptionTap(i)}
                      disabled={isEliminated || (showResult && resolved)}
                      className={`px-6 py-4 rounded-2xl text-xl font-bold border-4 transition-all text-left
                        ${showResult && isCorrect ? 'bg-green-500/30 border-green-400 text-green-100'
                          : showResult && isSelected && !isCorrect ? 'bg-red-500/30 border-red-400 text-red-100 animate-shake'
                          : isEliminated ? 'bg-white/5 border-white/10 text-white/20 opacity-40 cursor-not-allowed'
                          : 'bg-white/10 border-white/20 text-amber-50 hover:border-amber-400 hover:-translate-y-1 shadow-md'}
                        ${revealedAnswer && isCorrect ? 'ring-4 ring-amber-400' : ''}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {/* Correct feedback */}
              {resolved && (
                <div className="mt-6 flex items-center gap-2 text-green-400 font-bold text-2xl animate-bounce">
                  <Check size={32} /> {pickedStudent ? `${pickedStudent.name} got it!` : 'Correct!'}
                </div>
              )}
              {/* 2nd-miss reveal */}
              {revealedAnswer && (
                <div className="mt-6 bg-amber-500/15 border-2 border-amber-400/50 rounded-2xl px-8 py-4 text-center max-w-2xl">
                  <div className="text-xl font-bold text-amber-300">The answer: {c.options[correctIndex]}</div>
                  {c.explanation && <p className="text-amber-100/80 mt-1">{c.explanation}</p>}
                </div>
              )}
            </motion.div>
          );
        })()}

        {/* ═══ SLIDE COMPLETE OVERLAY — click to dismiss ═══ */}
        {slideDone && (
          <motion.div
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setSlideDone(false)}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
          >
            <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center">
              <div className="w-32 h-32 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mb-6">
                <BookOpen size={60} />
              </div>
              <h2 className="text-5xl font-black text-slate-800 mb-2">
                {pickedStudent ? `Great reading, ${pickedStudent.name}!` : 'Great story, everyone!'}
              </h2>
              <p className="text-2xl text-slate-500 font-medium">Ready for the next slide.</p>
              <p className="text-sm text-slate-400 mt-4 animate-pulse">tap to dismiss</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Already-scored chip */}
      {alreadyScoredChip && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800/90 text-white px-5 py-2 rounded-full font-bold animate-fade-in">
          🔁 already scored this turn
        </div>
      )}

      <style>{`
        @keyframes ss-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: ss-shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};

export default BoardStoryStage;
