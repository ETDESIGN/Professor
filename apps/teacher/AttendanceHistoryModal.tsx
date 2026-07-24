import React, { useState } from 'react';
import { X, Check, Minus, ChevronLeft } from 'lucide-react';
import { useSessionOccurrences, useOccurrenceAttendance } from '../../hooks/useQueries';

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

const AttendanceHistoryModal: React.FC<{ classId: string; onClose: () => void }> = ({ classId, onClose }) => {
  const { data: sessions = [], isLoading } = useSessionOccurrences(classId);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: detail = [] } = useOccurrenceAttendance(openId ?? undefined);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {openId && <button onClick={() => setOpenId(null)} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={18} /></button>}
            <h2 className="font-bold text-lg text-slate-800">{openId ? 'Session detail' : 'Attendance history'}</h2>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {!openId && (
            isLoading ? <p className="text-sm text-slate-400 p-4">Loading…</p> :
            sessions.length === 0 ? <p className="text-sm text-slate-400 p-4 text-center">No sessions recorded yet.</p> :
            sessions.map(s => (
              <button key={s.id} onClick={() => setOpenId(s.id)}
                className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-slate-50 border-b border-slate-100 text-left">
                <span className="text-sm font-semibold text-slate-700">{fmt(s.started_at)}</span>
                <span className="text-xs font-bold text-slate-500">{s.present}/{s.total} present</span>
              </button>
            ))
          )}
          {openId && detail.map(m => {
            const present = m.status !== 'absent';
            return (
              <div key={m.roster_student_id} className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                <span className="text-sm font-medium text-slate-700">{m.name}</span>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center ${present ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {present ? <Check size={13} strokeWidth={3} /> : <Minus size={13} />}
                </span>
              </div>
            );
          })}
          {openId && detail.length === 0 && <p className="text-sm text-slate-400 p-4 text-center">No marks recorded for this session.</p>}
        </div>
      </div>
    </div>
  );
};

export default AttendanceHistoryModal;
