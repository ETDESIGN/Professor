import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, CalendarClock, Clock, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import UnitContentVault from './UnitContentVault';

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

interface FlowStep {
  id: string;
  type: string;
  title?: string;
  duration?: number;
}

const formatDuration = (secs?: number): string => {
  if (!secs || secs <= 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
};

const PlanTab: React.FC<{ flow: FlowStep[] }> = ({ flow }) => {
  if (!Array.isArray(flow) || flow.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 p-8">
        <CalendarClock size={40} />
        <p className="text-sm">No lesson plan yet.</p>
        <p className="text-xs">Generate content in the Content tab, then a flow will be built for this unit.</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-3">
      <p className="text-sm text-slate-500 mb-4">
        {flow.length} step{flow.length === 1 ? '' : 's'} &bull; this is the sequence that runs during a live class.
      </p>
      {flow.map((step, i) => (
        <div key={step.id || i} className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                {step.type}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-800 truncate mt-1">{step.title || step.type}</p>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 text-sm shrink-0">
            <Clock size={14} />
            {formatDuration(step.duration)}
          </div>
        </div>
      ))}
    </div>
  );
};

const UnitStudio: React.FC = () => {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<StudioTab>('content');
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

  const flow: FlowStep[] = Array.isArray(unit.flow) ? unit.flow : [];
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
          <PlanTab flow={flow} />
        )}
      </div>
    </div>
  );
};

export default UnitStudio;
