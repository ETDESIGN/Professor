
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Sparkles, Check, Loader2, X, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { createClientLogger } from '../../services/logger';

const log = createClientLogger('AIAnalysis');

interface GenerationJob {
  id: string;
  unit_id: string;
  stage: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  error: string | null;
  attempt: number;
  started_at: string | null;
  completed_at: string | null;
}

interface AIAnalysisProps {
  unitId: string | null;
  onCancel: () => void;
  onComplete: () => void;
}

// Map generation_jobs stages to the 4 UI step labels.
const STEP_LABELS = [
  "Uploading High-Res Images...",
  "Extracting Text Layout (OCR)...",
  "Identifying Vocabulary & Grammar...",
  "Generating Interactive Assets..."
];

// Stages expected for a complete generation pipeline.
const EXPECTED_STAGES = ['enrich-unit', 'generate-exercises'];

// Map a stage name to the UI step index it drives.
function stageToStep(stage: string): number {
  switch (stage) {
    case 'extract-page': return 0;
    case 'enrich-unit': return 1;
    case 'orchestrate-lesson': return 2;
    case 'generate-exercises': return 3;
    default: return -1;
  }
}

const POLL_INTERVAL_MS = 2000;
const STALL_TIMEOUT_MS = 120_000;

const AIAnalysis: React.FC<AIAnalysisProps> = ({ unitId, onCancel, onComplete }) => {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [failedJob, setFailedJob] = useState<GenerationJob | null>(null);
  const [isStalled, setIsStalled] = useState(false);
  const lastChangeRef = useRef<number>(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stallRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derive the current step from job statuses.
  const activeStep = (() => {
    if (jobs.length === 0) return 0;
    let maxCompletedStep = -1;
    let maxRunningStep = 0;
    for (const job of jobs) {
      const step = stageToStep(job.stage);
      if (step < 0) continue;
      if (job.status === 'succeeded') maxCompletedStep = Math.max(maxCompletedStep, step);
      if (job.status === 'running' || job.status === 'pending') maxRunningStep = Math.max(maxRunningStep, step);
    }
    // Show the step after the last completed one (or the running one).
    return Math.max(maxCompletedStep + 1, maxRunningStep, 0);
  })();

  const allSucceeded = EXPECTED_STAGES.every(stage =>
    jobs.some(j => j.stage === stage && j.status === 'succeeded')
  );

  const fetchJobs = useCallback(async () => {
    if (!unitId) return;
    try {
      const { data, error } = await supabase
        .from('generation_jobs')
        .select('id, unit_id, stage, status, error, attempt, started_at, completed_at')
        .eq('unit_id', unitId);
      if (error) {
        log.warn('poll_error', { error: error.message });
        return;
      }
      const newJobs = (data || []) as GenerationJob[];
      // Detect change for stall detection.
      const prevKey = jobs.map(j => `${j.stage}:${j.status}`).sort().join('|');
      const newKey = newJobs.map(j => `${j.stage}:${j.status}`).sort().join('|');
      if (prevKey !== newKey) {
        lastChangeRef.current = Date.now();
        setIsStalled(false);
      }
      setJobs(newJobs);
      // Check for failure.
      const failed = newJobs.find(j => j.status === 'failed');
      if (failed) setFailedJob(failed);
    } catch (err) {
      log.warn('poll_exception', { error: err instanceof Error ? err.message : String(err) });
    }
  }, [unitId, jobs]);

  // Poll loop.
  useEffect(() => {
    if (!unitId) return;
    fetchJobs(); // immediate first fetch
    pollRef.current = setInterval(fetchJobs, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [unitId, fetchJobs]);

  // Stall detection.
  useEffect(() => {
    stallRef.current = setInterval(() => {
      if (Date.now() - lastChangeRef.current > STALL_TIMEOUT_MS) {
        setIsStalled(true);
      }
    }, 5000);
    return () => { if (stallRef.current) clearInterval(stallRef.current); };
  }, []);

  // Fire onComplete when all expected stages succeed.
  useEffect(() => {
    if (allSucceeded && jobs.length > 0) {
      const timer = setTimeout(onComplete, 800);
      return () => clearTimeout(timer);
    }
  }, [allSucceeded, jobs.length, onComplete]);

  // ── Failure UI ─────────────────────────────────────────────────────
  if (failedJob) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl max-w-2xl w-full flex flex-col items-center relative overflow-hidden">
          <button onClick={onCancel} className="absolute top-8 right-8 text-slate-300 hover:text-slate-500">
            <X size={24} />
          </button>
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="text-red-500 w-10 h-10" />
          </div>
          <h2 className="text-2xl font-display font-bold text-slate-800 mb-2 text-center">Generation Failed</h2>
          <p className="text-slate-500 mb-4 text-center max-w-sm">
            {failedJob.error || `The ${failedJob.stage} stage failed unexpectedly.`}
          </p>
          <p className="text-sm text-slate-400 mb-6 text-center">
            You can re-publish from the Unit Studio to retry generation.
          </p>
          <button
            onClick={onComplete}
            className="px-6 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={18} /> Continue to Unit Studio
          </button>
        </div>
      </div>
    );
  }

  // ── Progress UI ────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
      <div className="bg-white p-12 rounded-[3rem] shadow-2xl max-w-2xl w-full flex flex-col items-center relative overflow-hidden">
         {/* Cancel Button */}
         <button onClick={onCancel} className="absolute top-8 right-8 text-slate-300 hover:text-slate-500">
            <X size={24} />
         </button>

         {/* Visual Indicator */}
         <div className="relative w-48 h-48 mb-12 flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-emerald-100 rounded-full animate-ping opacity-20"></div>
            <div className="absolute inset-4 border-4 border-emerald-200 rounded-full animate-pulse opacity-40"></div>
            <div className="absolute inset-8 border-4 border-emerald-300 rounded-full"></div>
            <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200 z-10">
               <Sparkles className="text-white w-12 h-12 animate-spin-slow" />
            </div>
         </div>

         <h2 className="text-3xl font-display font-bold text-slate-800 mb-2 text-center">AI Analysis in Progress</h2>
         <p className="text-slate-500 mb-2 text-center max-w-sm">We are digitizing your textbook into an interactive lesson.</p>
         {isStalled && (
           <p className="text-amber-500 text-sm font-medium mb-4 text-center">
             Taking longer than expected — large pages may need extra time…
           </p>
         )}

         {/* Steps List */}
         <div className="w-full max-w-md space-y-4 mt-4">
            {STEP_LABELS.map((label, index) => (
               <div key={index} className="flex items-center gap-4 transition-all duration-500">
                  <div className={`
                     w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors duration-300
                     ${index < activeStep ? 'bg-emerald-500 border-emerald-500 text-white' :
                       index === activeStep ? 'border-emerald-500 text-emerald-500' : 'border-slate-200 text-slate-300'}
                  `}>
                     {index < activeStep ? <Check size={16} strokeWidth={3} /> :
                      index === activeStep ? <Loader2 size={16} className="animate-spin" /> :
                      <span className="text-xs font-bold">{index + 1}</span>}
                  </div>
                  <span className={`font-medium ${index <= activeStep ? 'text-slate-700' : 'text-slate-300'}`}>
                     {label}
                  </span>
               </div>
            ))}
         </div>

         {/* Progress Bar */}
         <div className="w-full h-2 bg-slate-100 rounded-full mt-10 overflow-hidden">
            <div
               className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-1000 ease-out"
               style={{ width: `${((activeStep + 1) / STEP_LABELS.length) * 100}%` }}
            ></div>
         </div>
         <div className="mt-2 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
            {Math.round(((activeStep + 1) / STEP_LABELS.length) * 100)}% Complete
         </div>
      </div>

      <style>{`
        .animate-spin-slow { animation: spin 4s linear infinite; }
      `}</style>
    </div>
  );
};

export default AIAnalysis;
