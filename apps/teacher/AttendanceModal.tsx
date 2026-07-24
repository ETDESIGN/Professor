import React, { useMemo, useState } from 'react';
import { X, Check, Plus, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRosterForClass, useCreateRosterStudent, useSaveAttendance, useAttendanceForOccurrence } from '../../hooks/useQueries';
import { summarize } from '../../services/attendanceLogic';
import { supabase } from '../../services/supabaseClient';
import { toast } from 'sonner';

interface Props {
  classId: string;
  occurrenceId: string;
  onClose: () => void;
}

const AttendanceModal: React.FC<Props> = ({ classId, occurrenceId, onClose }) => {
  const { data: roster = [] } = useRosterForClass(classId);
  const { data: existing } = useAttendanceForOccurrence(occurrenceId);
  const createStudent = useCreateRosterStudent();
  const saveAttendance = useSaveAttendance();
  const [name, setName] = useState('');
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [teacherId, setTeacherId] = useState('');

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setTeacherId(data.user?.id || ''));
  }, []);

  // Seed absent set from any saved attendance for this occurrence (present by default).
  React.useEffect(() => {
    if (!existing) return;
    const next = new Set<string>();
    existing.forEach((status, id) => { if (status === 'absent') next.add(id); });
    setAbsent(next);
  }, [existing]);

  const rosterIds = useMemo(() => roster.map(r => r.id), [roster]);
  const presentIds = useMemo(
    () => new Set(rosterIds.filter(id => !absent.has(id))),
    [rosterIds, absent],
  );
  const counts = summarize(rosterIds, presentIds);

  const toggle = (id: string) => setAbsent(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const handleAdd = async () => {
    if (!name.trim() || !teacherId) return;
    try {
      await createStudent.mutateAsync({ classId, teacherId, displayName: name });
      setName('');
    } catch { /* toast in service */ }
  };

  const handleSave = async () => {
    if (!teacherId) { toast.error('Could not identify teacher. Please retry.'); return; }
    try {
      await saveAttendance.mutateAsync({ occurrenceId, classId, teacherId, rosterIds, presentIds });
      toast.success('Attendance saved');
      onClose();
    } catch { /* toast in service */ }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 z-0" onClick={onClose} />
        <motion.div initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
          className="relative z-10 bg-white w-full max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh]">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Users size={18} /> Attendance</h2>
              <p className="text-xs text-slate-500">{counts.present} present · {counts.absent} absent</p>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20} className="text-slate-600" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {roster.map(r => {
              const present = !absent.has(r.id);
              return (
                <button key={r.id} onClick={() => toggle(r.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${present ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white opacity-60'}`}>
                  <span className="font-semibold text-slate-700">{r.display_name}</span>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center ${present ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                    {present && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
            {roster.length === 0 && <p className="text-center text-sm text-slate-400 py-6">No students on the roster yet.</p>}
          </div>

          <div className="p-3 border-t border-slate-100 space-y-2">
            <div className="flex gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Add walk-in student…"
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <button onClick={handleAdd} disabled={!name.trim()} className="px-3 py-2 bg-slate-100 rounded-xl text-slate-600 hover:bg-slate-200 disabled:opacity-40"><Plus size={18} /></button>
            </div>
            <button onClick={handleSave} disabled={saveAttendance.isPending}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50">
              {saveAttendance.isPending ? 'Saving…' : 'Save attendance'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AttendanceModal;
