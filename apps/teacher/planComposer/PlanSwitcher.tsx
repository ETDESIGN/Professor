import React, { useState } from 'react';
import { Plus, Copy, Trash2, Star, Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Engine } from '../../../services/SupabaseService';
import type { UnitPlan } from '../../../services/planFlow';

// PlanSwitcher — multiple named plans per unit (spec 2026-09-13): Lesson 1,
// Lesson 2, Revision… The active plan receives every Save / Launch live /
// Regenerate. The DEFAULT plan (star) is what units.flow mirrors — legacy
// consumers and old sessions always see it.

interface PlanSwitcherProps {
  unitId: string;
  plans: UnitPlan[];
  activePlanId: string | null;
  busy: boolean;
  onSelect: (planId: string) => void;
  /** All plan mutations reload the list through the parent. */
  onPlansChanged: (plans: UnitPlan[], activePlanId?: string) => void;
}

const PlanSwitcher: React.FC<PlanSwitcherProps> = ({ unitId, plans, activePlanId, busy, onSelect, onPlansChanged }) => {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const reload = async (preferId?: string) => {
    const fresh = await Engine.listUnitPlans(unitId);
    const active = preferId && fresh.some((p) => p.id === preferId) ? preferId : fresh.find((p) => p.isDefault)?.id ?? fresh[0]?.id ?? null;
    onPlansChanged(fresh, active);
  };

  const createPlan = async () => {
    const name = window.prompt('Name the new plan (e.g. Lesson 2, Revision)');
    if (!name) return;
    setCreating(true);
    try {
      const plan = await Engine.createUnitPlan(unitId, name.trim().slice(0, 60));
      if (!plan) throw new Error('Plan was not created');
      await reload(plan.id);
      toast.success(`Plan “${plan.title}” created`);
    } catch (err: any) {
      toast.error(`Could not create the plan: ${err?.message || err}`);
    } finally {
      setCreating(false);
    }
  };

  const duplicate = async (plan: UnitPlan) => {
    try {
      const copy = await Engine.duplicateUnitPlan(plan.id, `${plan.title} (copy)`.slice(0, 60));
      if (!copy) throw new Error('Copy was not created');
      await reload(copy.id);
      toast.success('Plan duplicated');
    } catch (err: any) {
      toast.error(`Could not duplicate: ${err?.message || err}`);
    }
  };

  const rename = async (plan: UnitPlan) => {
    const name = window.prompt('Rename the plan', plan.title);
    if (!name || name.trim() === plan.title) { setRenaming(null); return; }
    try {
      await Engine.renameUnitPlan(plan.id, name.trim().slice(0, 60));
      await reload(activePlanId ?? undefined);
    } catch (err: any) {
      toast.error(`Could not rename: ${err?.message || err}`);
    } finally {
      setRenaming(null);
    }
  };

  const remove = async (plan: UnitPlan) => {
    if (!window.confirm(`Delete the plan “${plan.title}”? Its steps are lost.`)) return;
    try {
      await Engine.deleteUnitPlan(plan.id);
      await reload();
      toast.success('Plan deleted');
    } catch (err: any) {
      toast.error(`Could not delete: ${err?.message || err}`);
    }
  };

  const setDefault = async (plan: UnitPlan) => {
    if (plan.isDefault) return;
    try {
      await Engine.setDefaultUnitPlan(plan.id);
      await reload(activePlanId ?? undefined);
      toast.success(`“${plan.title}” is now the default plan`);
    } catch (err: any) {
      toast.error(`Could not set default: ${err?.message || err}`);
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {plans.map((plan) => {
        const active = plan.id === activePlanId;
        return (
          <div
            key={plan.id}
            className={`group relative flex items-center gap-1 pl-2.5 pr-1.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
              active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <button type="button" onClick={() => onSelect(plan.id)} className="max-w-[10rem] truncate" title={plan.title}>
              {plan.title}
              {plan.isDefault && <span className={`ml-1 ${active ? 'text-amber-300' : 'text-amber-500'}`} title="Default plan (shown to old sessions / mirrored to the unit)">★</span>}
            </button>
            <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" onClick={() => setRenaming(plan.id)} className={`p-1 rounded ${active ? 'hover:bg-indigo-500' : 'hover:bg-slate-100'}`} title="Rename">
                <Pencil size={11} />
              </button>
              <button type="button" onClick={() => duplicate(plan)} className={`p-1 rounded ${active ? 'hover:bg-indigo-500' : 'hover:bg-slate-100'}`} title="Duplicate (fast way to build a Revision plan)">
                <Copy size={11} />
              </button>
              <button type="button" onClick={() => setDefault(plan)} disabled={plan.isDefault} className={`p-1 rounded disabled:opacity-30 ${active ? 'hover:bg-indigo-500' : 'hover:bg-slate-100'}`} title="Make default">
                <Star size={11} />
              </button>
              <button type="button" onClick={() => remove(plan)} className={`p-1 rounded ${active ? 'hover:bg-rose-500' : 'hover:bg-rose-50 hover:text-rose-500'}`} title="Delete plan">
                <Trash2 size={11} />
              </button>
            </span>
            {renaming === plan.id && <RenameInline key={`rn-${plan.id}`} plan={plan} onDone={(n) => { setRenaming(null); if (n) void renameWith(plan, n); }} />}
          </div>
        );
      })}
      <button
        type="button"
        onClick={createPlan}
        disabled={creating || busy}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs font-bold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
        title="Add another plan (Lesson 2, Revision…)"
      >
        {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        Plan
      </button>
    </div>
  );

  async function renameWith(plan: UnitPlan, name: string) {
    try {
      await Engine.renameUnitPlan(plan.id, name.slice(0, 60));
      await reload(activePlanId ?? undefined);
    } catch (err: any) {
      toast.error(`Could not rename: ${err?.message || err}`);
    }
  }
};

const RenameInline: React.FC<{ plan: UnitPlan; onDone: (name: string | null) => void }> = ({ plan, onDone }) => {
  const [val, setVal] = useState(plan.title);
  return (
    <span className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onDone(val.trim()); if (e.key === 'Escape') onDone(null); }}
        className="w-40 p-1.5 border border-slate-200 rounded text-xs"
      />
      <button type="button" onClick={() => onDone(val.trim())} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-bold">OK</button>
    </span>
  );
};

export default PlanSwitcher;
