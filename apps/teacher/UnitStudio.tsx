import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, CalendarClock, Loader2, Wand2, Save, Play, X, Dices, Route } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../services/supabaseClient';
import { invokeGenerateExercises, waitForGenerationJob, getPoolCount } from '../../services/ExercisePoolService';
import UnitContentVault from './UnitContentVault';
import PlanComposer from './PlanComposer';
import StudentPathComposer from './StudentPathComposer';
import { useUnitStudioStore } from '../../store/useUnitStudioStore';

// Task 15: AssetWorkshop is now an IN-STUDIO Review mode (not a separate route).
// Lazy-loaded so the (heavy) review surface doesn't bloat the Studio's main bundle
// when the teacher isn't reviewing. It's rendered as an overlay panel over the
// Content/Plan tabs, with onBack closing the mode and onOrchestrate returning to
// the Content tab (the unit is already loaded — no re-navigation needed).
const AssetWorkshop = lazy(() => import('./AssetWorkshop'));

// Phase 2 (F2, decided D3) — the Unified Unit Studio. One component, one route
// (/teacher/unit/:unitId), two tabs:
//   - Content: the per-category authoring surface (reuses UnitContentVault's
//     working editors in embedded mode — the real save path).
//   - Plan: the lesson-flow view (what runs live). Read-only for this first
//     increment; full composing lands with the timeline rewrite.
// This is the single entry point that retires the 4-editor fragmentation
// (LessonTimelineBuilder mock, LessonStudio KG toggle, AssetWorkshop, and the
// standalone UnitContentVault route) once validated.

type StudioTab = 'content' | 'plan' | 'path';

const UnitStudio: React.FC = () => {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  // Task 14: the single save action lives here (the Studio header).
  const storeSave = useUnitStudioStore(s => s.save);
  const saving = useUnitStudioStore(s => s.saving);
  const dirty = useUnitStudioStore(s => s.dirty);
  // Initial tab honors ?tab=plan so the unit card's "Plan" action lands on the
  // Plan tab (the Content/"Review Content" action lands on Content by default).
  const [tab, setTab] = useState<StudioTab>(() => {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
    return q === 'plan' ? 'plan' : q === 'path' ? 'path' : 'content';
  });
  const [unit, setUnit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Task 15: in-Studio Review mode (replaces the /teacher/review/:id route).
  const [showReview, setShowReview] = useState(false);
  // Phase 3: manual exercise-pool generation state (button in the header).
  const [generating, setGenerating] = useState(false);
  const [poolCount, setPoolCount] = useState<number | null>(null);
  // Phase 2.4: mobile gets a Content-only surface (no Plan tab) for v1.
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // If we shrink to mobile while on the Plan/Path tab, fall back to Content.
  useEffect(() => {
    if (isMobile && (tab === 'plan' || tab === 'path')) setTab('content');
  }, [isMobile, tab]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!unitId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase.from('units').select('*').eq('id', unitId).maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setUnit(null);
        } else {
          setUnit(data);
        }
        // Best-effort pool count for the generate button's badge.
        getPoolCount(unitId).then(n => { if (!cancelled) setPoolCount(n); }).catch(() => {});
      } catch {
        if (!cancelled) setUnit(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [unitId]);

  // Phase 3: run generate-exercises for this unit and surface the result.
  // Owner or admin only (enforced server-side by assertUnitOwnership).
  const handleGenerateExercises = async () => {
    if (!unitId || generating) return;
    setGenerating(true);
    try {
      const started = await invokeGenerateExercises(unitId);
      if (!started.success) {
        toast.error(`Generation rejected: ${started.error || 'unknown error'}`);
        return;
      }
      // The function itself flips the job row; poll for the terminal state so
      // the toast reflects the real outcome (exercises written or not).
      const job = await waitForGenerationJob(unitId);
      const n = await getPoolCount(unitId);
      setPoolCount(n);
      if (job.status === 'succeeded') {
        toast.success(n > 0 ? `Exercises ready — ${n} items in the pool` : 'Generation finished, but no exercises were produced (enrich the unit first)');
      } else if (job.status === 'failed') {
        toast.error(`Generation failed: ${job.error || 'unknown error'}`);
      } else {
        toast('Generation still running — check the unit list badge in a moment', { icon: '⏳' });
      }
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen bg-slate-50">
        <Loader2 size={32} className="animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-screen bg-slate-50 gap-3">
        <p className="text-slate-600 font-medium">Unit not found.</p>
        <button onClick={() => navigate('/teacher/units')} className="text-indigo-600 text-sm hover:underline">
          Back to units
        </button>
      </div>
    );
  }

  const flow: any[] = Array.isArray(unit.flow) ? unit.flow : [];
  const studentPathLength: number = Array.isArray(unit.student_path) ? unit.student_path.length : 0;
  const manifest = unit.manifest?.enriched_content || {};
  const theme = unit.manifest?.meta?.theme || manifest.topic || unit.topic || '';
  const cefr = unit.manifest?.meta?.difficulty_cefr || manifest.gradeLevel || unit.level || '';

  return (
    <div className="flex-1 flex flex-col h-screen bg-slate-50">
      {/* Studio header: back + title + tab switcher */}
      <header className="bg-white border-b border-slate-200 px-6 pt-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/teacher/units')} className="p-2 hover:bg-slate-100 rounded-lg" title="Back to units">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                {unit.manifest?.meta?.unit_title || unit.title || 'Unit Studio'}
                {dirty.size > 0 && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-amber-400" title="Unsaved edits" />}
              </h1>
              <p className="text-sm text-slate-500">{theme}{theme && cefr ? ' \u2022 ' : ''}{cefr}</p>
            </div>
          </div>
          {/* Task 15: Review is now an IN-STUDIO mode (not a route). The button
              toggles an overlay panel rendering AssetWorkshop, so the teacher
              never leaves the Studio to approve/regenerate. */}
          <div className="flex items-center gap-3">
            {/* Phase 3: manual pool generation — the retry path for units whose
                fire-and-forget trigger was dropped before the Aug-17 fix. */}
            <button
              onClick={handleGenerateExercises}
              disabled={generating || saving}
              className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-100 disabled:opacity-50 transition-colors"
              title="Generate the exercise pool (objectives + pool items) for this unit"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Dices size={16} />}
              Exercises{poolCount !== null && poolCount > 0 && (
                <span className="bg-amber-200 text-amber-800 text-xs px-1.5 py-0.5 rounded-full">{poolCount}</span>
              )}
            </button>
            <button
              onClick={() => setShowReview(true)}
              className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors"
              title="Review, approve or regenerate the generated content"
            >
              <Wand2 size={16} /> Review
            </button>
            {/* Task 14: single [Save] + [Publish & Teach] in the Studio header. */}
            <button
              onClick={() => storeSave()}
              disabled={saving || dirty.size === 0}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              title={dirty.size === 0 ? 'Nothing to save' : 'Save all edits'}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save
            </button>
            <button
              onClick={async () => {
                const ok = await storeSave();
                if (!ok) return;
                // Phase 3: never teach an empty pool — kick generation in the
                // background (non-blocking) when the unit has no exercises yet.
                if (unitId && (poolCount ?? 0) === 0) {
                  invokeGenerateExercises(unitId).then(r => {
                    if (!r.success) toast.warning(`Exercise generation could not start: ${r.error || 'unknown error'}`);
                    else toast('Exercise generation started in the background', { icon: '⏳' });
                  });
                }
                navigate('/teacher/live');
              }}
              disabled={saving}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Play size={16} /> Publish & Teach
            </button>
          </div>
        </div>
        <nav className="flex gap-1 mt-3">
          <button
            onClick={() => setTab('content')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium border-b-2 transition-colors ${
              tab === 'content'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <BookOpen size={16} />
            Content
          </button>
          {!isMobile && (
          <button
            onClick={() => setTab('plan')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium border-b-2 transition-colors ${
              tab === 'plan'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <CalendarClock size={16} />
            Plan
            {flow.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === 'plan' ? 'bg-indigo-100' : 'bg-slate-100'}`}>{flow.length}</span>
            )}
          </button>
          )}
          {!isMobile && (
          <button
            onClick={() => setTab('path')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium border-b-2 transition-colors ${
              tab === 'path'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
            title="Plan the Duolingo-style node path students play in the student app"
          >
            <Route size={16} />
            Student Path
            {studentPathLength > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === 'path' ? 'bg-emerald-100' : 'bg-slate-100'}`}>{studentPathLength}</span>
            )}
          </button>
          )}
        </nav>
      </header>

      {/* Tab body */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {tab === 'content' ? (
          <UnitContentVault embedded />
        ) : tab === 'plan' ? (
          <PlanComposer
            unitId={unit.id}
            unit={unit}
            onFlowSaved={(f) => setUnit((prev: any) => ({ ...prev, flow: f }))}
          />
        ) : (
          <StudentPathComposer
            unitId={unit.id}
            unit={unit}
            onPathSaved={(p) => setUnit((prev: any) => ({ ...prev, student_path: p }))}
          />
        )}
      </div>

      {/* Task 15: Review mode overlay. AssetWorkshop renders as a full-screen
          panel over the Studio (preserving Studio state underneath). onBack
          closes the mode; onOrchestrate also closes it (the unit is already
          loaded in the Studio — no re-navigation). The close X is a secondary
          affordance for discoverability. */}
      {showReview && unitId && (
        <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Wand2 size={16} className="text-indigo-600" /> Review generated content
            </div>
            <button
              onClick={() => setShowReview(false)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
              title="Close review (back to Studio)"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-indigo-600" /></div>}>
              <AssetWorkshop
                unitId={unitId}
                onBack={() => setShowReview(false)}
                onOrchestrate={() => {
                  setShowReview(false);
                  setTab('content');
                  // The store may have new content after orchestration; reload.
                  useUnitStudioStore.getState().load(unitId);
                }}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnitStudio;
