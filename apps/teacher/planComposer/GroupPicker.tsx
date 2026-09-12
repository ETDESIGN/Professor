import React from 'react';
import { Check } from 'lucide-react';

// GroupPicker — content-group selection for a plan block (spec 2026-09-13).
// Vocab games take a MULTI-select of the unit's series; story/comic blocks a
// single pick. Writing a new selection rebuilds the block's group tags
// (group_id / group_ids / structure_ids / group_kind / group_title).

export interface GroupOption {
  id: string;
  kind: string;
  title: string;
  structure_ids: string[];
  detail?: string;
}

interface GroupPickerProps {
  mode: 'multi' | 'single';
  options: GroupOption[];
  selected: string[]; // group ids
  onChange: (selectedIds: string[]) => void;
  /** Extra chip offered when no real groups exist (legacy units). */
  allowAllOption?: { id: string; title: string; detail?: string };
}

const KIND_BADGE: Record<string, string> = {
  vocab_series: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  story: 'bg-amber-50 text-amber-700 border-amber-200',
  comic: 'bg-purple-50 text-purple-700 border-purple-200',
  song: 'bg-blue-50 text-blue-700 border-blue-200',
};

const GroupPicker: React.FC<GroupPickerProps> = ({ mode, options, selected, onChange, allowAllOption }) => {
  const toggle = (id: string) => {
    if (mode === 'single') {
      onChange([id]);
      return;
    }
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  if (options.length === 0 && allowAllOption) {
    return (
      <div className={`px-3 py-2.5 rounded-lg border text-sm font-bold ${KIND_BADGE.vocab_series}`}>
        {allowAllOption.title}
        {allowAllOption.detail ? <span className="block text-[11px] font-medium opacity-70 mt-0.5">{allowAllOption.detail}</span> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {options.map((g) => {
        const on = selected.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => toggle(g.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
              on ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <span className={`text-[9px] font-bold uppercase tracking-wide border px-1.5 py-0.5 rounded shrink-0 ${KIND_BADGE[g.kind] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              {g.kind === 'vocab_series' ? 'series' : g.kind}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-slate-700 truncate">{g.title}</span>
              {g.detail ? <span className="block text-[11px] text-slate-400 truncate">{g.detail}</span> : null}
            </span>
            {on && <Check size={16} className="text-indigo-600 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
};

export default GroupPicker;
