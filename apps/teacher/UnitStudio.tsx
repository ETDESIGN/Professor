import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, CalendarClock, Loader2, Wand2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import UnitContentVault from './UnitContentVault';
import PlanComposer from './PlanComposer';

// Phase 2 (F2, decided D3) — the Unified Unit Studio. One component, one route
// (/teacher/unit/:unitId), two tabs:
//   - Content: the per-category authoring surface (reuses UnitContentVault's
//     working editors in embedded mode — the real save path).
//   - Plan: the lesson-flow view (what runs live). Read-only for this first
//     increment; full composing lands with the timeline rewrite.
// This is the single entry point that retires the 4-editor fragmentation
// (LessonTimelineBuilder mock, LessonStudio KG toggle, AssetWorkshop, and the
// standalone UnitContentVault route) once validated.

type StudioTab = 'content' | 'plan';

const UnitStudio: React.FC = () => {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  // Initial tab honors ?tab=plan so the unit card's "Plan" action lands on the
  // Plan tab (the Content/"Review Content" action lands on Content by default).
  const [tab, setTab] = useState<StudioTab>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'plan'
      ? 'plan'
      : 'content'
  );
  const [unit, setUnit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Phase 2.4: mobile gets a Content-only surface (no Plan tab) for v1.
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // If we shrink to mobile while on the Plan tab, fall back to Content.
  useEffect(() => {
    if (isMobile && tab === 'plan') setTab('content');
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
      } catch {
        if (!cancelled) setUnit(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [unitId]);

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
              <h1 className="text-xl font-bold text-slate-800">{unit.manifest?.meta?.unit_title || unit.title || 'Unit Studio'}</h1>
              <p className="text-sm text-slate-500">{theme}{theme && cefr ? ' \u2022 ' : ''}{cefr}</p>
            </div>
          </div>
          {/* Phase 2.3 / G2: persistent entry point into the approve/reject Review
              pass (AssetWorkshop, now routable by unit id). */}
          <button
            onClick={() => navigate(`/teacher/review/${unit.id}`)}
            className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors"
            title="Review, approve or regenerate the generated content"
          >
            <Wand2 size={16} /> Review
          </button>
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
        </nav>
      </header>

      {/* Tab body */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {tab === 'content' ? (
          <UnitContentVault embedded />
        ) : (
          <PlanComposer
            unitId={unit.id}
            unit={unit}
            onFlowSaved={(f) => setUnit((prev: any) => ({ ...prev, flow: f }))}
          />
        )}
      </div>
    </div>
  );
};

export default UnitStudio;
