// BoardGrammarSandbox v2 — the grammar INPUT/presentation stage (grammar-strand
// spec §1 / architecture §5.1).
//
// Demonstrates the rule in action (not just states it), using the fields the
// old version ignored: pattern_template (rendered as a visual slot skeleton),
// transformation_pairs (original → tap → transformed with changed tokens
// highlighted), and error_examples (an unanswered teaser that BoardGrammarForge
// rung 2 consumes — the "rule, then rule in action" coordination).
//
// Reads grammar_rules DIRECTLY via getGrammar(manifest) — not via pool items,
// because pattern_template / transformation_pairs live on grammar_rules and are
// never built into pool items. Teacher-paced (nav dots, prev/next). NO scoring.

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronRight, Lightbulb, RefreshCcw, Sparkles, Zap } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { getGrammar, type CanonicalGrammar } from '../../../services/manifest';

const TRANSFORM_DEMO_CAP = 3; // spec: cap demo cards at 3 pairs

type SandboxCard =
  | { kind: 'pattern' }
  | { kind: 'transform'; pairIndex: number; original: string; transformed: string; diffTokens: { text: string; changed: boolean }[] }
  | { kind: 'errorTeaser' };

interface TransformCard {
  kind: 'transform';
  pairIndex: number;
  original: string;
  transformed: string;
  diffTokens: { text: string; changed: boolean }[];
}

/** Split `original` and `transformed` into tokens, flagging the ones that
 *  differ between them so the reveal can highlight what changed. Word-level. */
function diffTransform(original: string, transformed: string): { text: string; changed: boolean }[] {
  const o = original.split(/\s+/).filter(Boolean);
  const t = transformed.split(/\s+/).filter(Boolean);
  // Simple positional diff — good enough for short grammar-drill sentences.
  // (LCS would be more precise but overkill for a presentation reveal.)
  const maxLen = Math.max(o.length, t.length);
  const out: { text: string; changed: boolean }[] = [];
  for (let i = 0; i < maxLen; i++) {
    const ot = o[i];
    const tt = t[i];
    if (tt === undefined) continue;
    if (ot === tt) {
      out.push({ text: tt, changed: false });
    } else {
      out.push({ text: tt, changed: true });
    }
  }
  return out;
}

function buildCards(rule: CanonicalGrammar): SandboxCard[] {
  const cards: SandboxCard[] = [];
  const pairs = Array.isArray(rule.transformation_pairs) ? rule.transformation_pairs : [];
  const errors = Array.isArray(rule.error_examples) ? rule.error_examples : [];

  // Card 1 — pattern skeleton (always present if there's a rule at all)
  cards.push({ kind: 'pattern' });

  // Cards 2..N — transform demo (up to TRANSFORM_DEMO_CAP pairs)
  const demoPairs = pairs.slice(0, TRANSFORM_DEMO_CAP);
  demoPairs.forEach((p: any, i: number) => {
    const original = String(p?.original ?? '');
    const transformed = String(p?.transformed ?? '');
    if (!original || !transformed) return;
    cards.push({
      kind: 'transform',
      pairIndex: i,
      original,
      transformed,
      diffTokens: diffTransform(original, transformed),
    });
  });

  // Final card — error teaser (index [0] specifically — the same entry Forge rung 2
  // consumes, so the unanswered teaser here becomes the first answered question there)
  if (errors.length > 0) {
    cards.push({ kind: 'errorTeaser' });
  }

  return cards;
}

const BoardGrammarSandbox: React.FC<{ data?: any }> = ({ data }) => {
  const { state } = useSession();
  // Prefer the canonical grammar_rules (via getGrammar → _relational), fall
  // back to the frozen slide `data` for flows authored before relationalization.
  const grammarRules = useMemo<CanonicalGrammar[]>(() => {
    const fromManifest = state.activeUnit?.manifest ? getGrammar(state.activeUnit.manifest) : [];
    if (fromManifest.length > 0) return fromManifest;
    // Fallback: the frozen data block (old shape: {rule, explanation, examples}).
    if (data?.rule) {
      return [{
        rule: data.rule,
        explanation: data.explanation,
        examples: Array.isArray(data.examples) ? data.examples : [],
        pattern_template: data.pattern_template,
        transformation_pairs: Array.isArray(data.transformation_pairs) ? data.transformation_pairs : [],
        error_examples: Array.isArray(data.error_examples) ? data.error_examples : [],
      }];
    }
    return [];
  }, [state.activeUnit?.manifest, data]);

  // Which rule are we presenting? The first one (a Sandbox slide typically
  // covers one rule; if multiple, the teacher advances through them).
  const [ruleIndex, setRuleIndex] = useState(0);
  const rule = grammarRules[ruleIndex];

  const cards = useMemo(() => (rule ? buildCards(rule) : []), [rule]);
  const [activeCard, setActiveCard] = useState(0);

  // Reset card position when the rule changes.
  useEffect(() => { setActiveCard(0); }, [ruleIndex]);

  // Reveal state for transform cards (original shown first, transformed on tap).
  const [transformRevealed, setTransformRevealed] = useState(false);
  useEffect(() => { setTransformRevealed(false); }, [activeCard]);

  // Remote/commander handlers (teacher-paced presentation).
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (a.type === 'NEXT_PANEL' || a.type === 'NEXT_CARD' || a.type === 'NEXT_ROUND') {
      setActiveCard((prev) => Math.min(prev + 1, cards.length - 1));
    } else if (a.type === 'PREV_PANEL' || a.type === 'PREV_CARD') {
      setActiveCard((prev) => Math.max(prev - 1, 0));
    } else if (a.type === 'FLIP_CARD') {
      setTransformRevealed((prev) => !prev);
    } else if (a.type === 'RESET_GAME') {
      setActiveCard(0);
      setTransformRevealed(false);
      setRuleIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // Empty-state: no grammar rules at all.
  if (!rule) {
    return (
      <div className="h-full bg-slate-900 flex items-center justify-center text-white font-display">
        <div className="text-center">
          <BookOpen size={64} className="text-blue-400 mx-auto mb-4 opacity-50" />
          <h2 className="text-4xl font-bold mb-2">Grammar Lesson</h2>
          <p className="text-slate-400 text-xl">No grammar rules available for this unit.</p>
        </div>
      </div>
    );
  }

  const card = cards[activeCard];
  const patternTemplate = rule.pattern_template;
  const errors = Array.isArray(rule.error_examples) ? rule.error_examples : [];
  const teaser = errors[0];

  return (
    <div className="h-full bg-gradient-to-br from-sky-100 via-blue-50 to-indigo-100 flex flex-col relative overflow-hidden font-display select-none">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(#3b82f6 2px, transparent 2px)', backgroundSize: '40px 40px' }}></div>

      {/* Header */}
      <div className="relative z-10 p-8 flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <BookOpen size={32} className="text-white" />
          </div>
          <div>
            <div className="text-indigo-400 font-bold uppercase tracking-widest text-sm mb-1">Grammar Rule</div>
            <h1 className="text-4xl font-bold text-slate-800">{rule.rule || 'Grammar'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {rule.explanation && (
            <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-xl text-slate-600 text-sm font-medium border border-white/50 max-w-xs">
              {rule.explanation}
            </div>
          )}
          <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-xl border border-white/50">
            <span className="text-slate-400 text-sm font-medium">{activeCard + 1} / {cards.length}</span>
          </div>
        </div>
      </div>

      {/* Card content */}
      <div className="flex-1 relative z-10 flex flex-col items-center justify-center px-12 pb-8">
        {card.kind === 'pattern' && (
          <PatternCard rule={rule.rule || 'Grammar'} template={patternTemplate} explanation={rule.explanation} />
        )}

        {card.kind === 'transform' && (
          <TransformCardView
            card={card as TransformCard}
            revealed={transformRevealed}
            onReveal={() => setTransformRevealed(true)}
          />
        )}

        {card.kind === 'errorTeaser' && (
          <ErrorTeaserCard wrong={String(teaser?.wrong ?? '')} correct={String(teaser?.correct ?? '')} />
        )}
      </div>

      {/* Navigation dots */}
      {cards.length > 1 && (
        <div className="flex items-center gap-3 mb-6 relative z-10 justify-center">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => { setActiveCard(i); setTransformRevealed(false); }}
              className={`w-3 h-3 rounded-full transition-all ${i === activeCard ? 'bg-indigo-500 scale-125' : 'bg-slate-300 hover:bg-slate-400'}`}
            />
          ))}
        </div>
      )}

      {/* Footer nav */}
      <div className="relative z-10 p-4 flex justify-between items-center bg-white/50 backdrop-blur border-t border-white/50">
        <button
          onClick={() => { setActiveCard(Math.max(0, activeCard - 1)); setTransformRevealed(false); }}
          disabled={activeCard === 0}
          className="px-4 py-2 rounded-xl bg-white text-slate-600 font-bold text-sm disabled:opacity-30 hover:bg-slate-50 transition-colors border border-slate-200"
        >
          Previous
        </button>
        <button
          onClick={() => { setActiveCard(0); setTransformRevealed(false); setRuleIndex(0); }}
          className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
        >
          <RefreshCcw size={18} />
        </button>
        <button
          onClick={() => { setActiveCard(Math.min(cards.length - 1, activeCard + 1)); setTransformRevealed(false); }}
          disabled={activeCard >= cards.length - 1}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-30 hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

// ── Card 1: Pattern skeleton ──────────────────────────────────────────
const PatternCard: React.FC<{ rule: string; template?: string; explanation?: string }> = ({ rule, template, explanation }) => {
  // Render pattern_template as visual slot tiles if it contains a slot marker
  // (___ or [blank]); otherwise show it as a styled sentence.
  const tiles = useMemo(() => {
    if (!template) return null;
    // Split on the slot marker, keeping the structure visible.
    if (template.includes('___') || /\[blank\]/i.test(template)) {
      return template.split(/(_{2,}|\[blank\])/i).filter((s) => s.length > 0).map((seg, i) => ({
        text: seg,
        isSlot: /_{2,}|\[blank\]/i.test(seg),
      }));
    }
    return template.split(/\s+/).filter(Boolean).map((seg) => ({ text: seg, isSlot: false }));
  }, [template]);

  return (
    <div className="w-full max-w-4xl flex flex-col items-center gap-8">
      <div className="text-center">
        <div className="text-indigo-300 font-bold text-sm uppercase tracking-widest mb-2">The Pattern</div>
        <p className="text-slate-400 text-lg">{explanation || 'How this rule forms a sentence'}</p>
      </div>
      {tiles ? (
        <div className="flex flex-wrap gap-3 justify-center">
          {tiles.map((tile, i) => (
            <div
              key={i}
              className={`px-6 py-4 rounded-2xl text-2xl font-bold border-4 transition-all ${
                tile.isSlot
                  ? 'bg-yellow-100 border-yellow-400 text-yellow-700 border-dashed min-w-[120px] text-center'
                  : 'bg-white border-indigo-100 text-slate-700'
              }`}
            >
              {tile.isSlot ? '_____' : tile.text}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white/70 backdrop-blur rounded-2xl p-8 text-center">
          <p className="text-slate-400 text-lg">No pattern template available for this rule.</p>
        </div>
      )}
      <div className="flex items-center gap-2 text-indigo-400 text-sm font-medium">
        <Sparkles size={16} />
        <span>Notice the structure — we'll see it in action next.</span>
      </div>
    </div>
  );
};

// ── Cards 2..N: Transform demo ────────────────────────────────────────
const TransformCardView: React.FC<{ card: TransformCard; revealed: boolean; onReveal: () => void }> = ({ card, revealed, onReveal }) => (
  <div className="w-full max-w-4xl flex flex-col items-center gap-8">
    <div className="text-indigo-300 font-bold text-sm uppercase tracking-widest">Example {card.pairIndex + 1} — Transform</div>

    {/* Original sentence (always shown) */}
    <div className="bg-white rounded-3xl shadow-lg p-8 border-4 border-indigo-100 w-full">
      <div className="text-indigo-400 font-bold text-xs uppercase tracking-widest mb-3">Original</div>
      <p className="text-slate-800 text-4xl font-bold leading-snug text-center">{card.original}</p>
    </div>

    {/* Transformed sentence (revealed on tap) */}
    {revealed ? (
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl shadow-lg p-8 border-4 border-emerald-300 w-full animate-fade-in">
        <div className="text-emerald-500 font-bold text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
          <Zap size={14} /> Transformed
        </div>
        <p className="text-slate-800 text-4xl font-bold leading-snug text-center flex flex-wrap gap-2 justify-center items-baseline">
          {card.diffTokens.map((tok, i) => (
            <span
              key={i}
              className={tok.changed ? 'bg-emerald-200 px-2 py-0.5 rounded-lg text-emerald-800 underline decoration-emerald-500 decoration-2' : ''}
            >
              {tok.text}
            </span>
          ))}
        </p>
      </div>
    ) : (
      <button
        onClick={onReveal}
        className="px-10 py-5 bg-indigo-600 text-white font-bold text-xl rounded-2xl shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-3"
      >
        <Lightbulb size={24} /> Show the transformation
      </button>
    )}
  </div>
);

// ── Final card: Error teaser ──────────────────────────────────────────
const ErrorTeaserCard: React.FC<{ wrong: string; correct: string }> = ({ wrong }) => (
  <div className="w-full max-w-4xl flex flex-col items-center gap-8">
    <div className="text-amber-400 font-bold text-sm uppercase tracking-widest">Spot the mistake</div>
    <div className="bg-amber-50 rounded-3xl shadow-lg p-10 border-4 border-amber-300 w-full">
      <div className="text-amber-500 font-bold text-xs uppercase tracking-widest mb-4">What's wrong here?</div>
      <p className="text-slate-800 text-4xl font-bold leading-snug text-center">{wrong}</p>
    </div>
    <div className="text-slate-400 text-lg italic text-center max-w-md">
      We'll find out in the practice round ahead… 🔍
    </div>
  </div>
);

export default BoardGrammarSandbox;
