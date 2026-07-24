import { supabase } from './supabaseClient';
import { toast } from 'sonner';
import { createClientLogger } from './logger';
import { buildStatuses } from './attendanceLogic';

const log = createClientLogger('AttendanceService');

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface OccurrenceSummary {
  id: string;
  started_at: string;
  ended_at: string | null;
  present: number;
  total: number;
}

export interface OccurrenceMark {
  roster_student_id: string;
  name: string;
  status: AttendanceStatus;
}

/**
 * Return the id of the class's currently-open occurrence (ended_at IS NULL),
 * creating one if none is open. Called at go-live / when opening attendance.
 */
export async function getOrCreateActiveOccurrence(
  classId: string, teacherId: string, unitId?: string | null,
): Promise<string | null> {
  const { data: open } = await supabase
    .from('class_session_occurrences')
    .select('id')
    .eq('class_id', classId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open?.id) return open.id;

  const { data, error } = await supabase
    .from('class_session_occurrences')
    .insert({ class_id: classId, teacher_id: teacherId, unit_id: unitId ?? null })
    .select('id')
    .single();
  if (error) { log.warn('occurrence_create_error', { error: error.message }); return null; }
  return data.id;
}

/** Stamp ended_at on an occurrence (best-effort). */
export async function endOccurrence(occurrenceId: string): Promise<void> {
  const { error } = await supabase
    .from('class_session_occurrences')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', occurrenceId)
    .is('ended_at', null);
  if (error) log.warn('occurrence_end_error', { error: error.message });
}

/** Attendance for one occurrence as Map<roster_student_id, status>. */
export async function getAttendanceForOccurrence(
  occurrenceId: string,
): Promise<Map<string, AttendanceStatus>> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('roster_student_id, status')
    .eq('occurrence_id', occurrenceId);
  if (error) { log.warn('attendance_read_error', { error: error.message }); return new Map(); }
  const m = new Map<string, AttendanceStatus>();
  for (const r of (data || [])) m.set(r.roster_student_id, r.status as AttendanceStatus);
  return m;
}

/**
 * Persist a full present/absent pass for an occurrence. `presentIds` is the
 * set of roster ids marked present; every roster id gets a real row.
 */
export async function saveAttendance(
  occurrenceId: string, classId: string, teacherId: string,
  rosterIds: string[], presentIds: Set<string>,
): Promise<void> {
  if (rosterIds.length === 0) return;
  const statuses = buildStatuses(rosterIds, presentIds);
  const rows = [...statuses.entries()].map(([roster_student_id, status]) => ({
    occurrence_id: occurrenceId, class_id: classId, teacher_id: teacherId,
    roster_student_id, status, marked_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('attendance_records')
    .upsert(rows, { onConflict: 'occurrence_id,roster_student_id', ignoreDuplicates: false });
  if (error) {
    log.warn('save_attendance_error', { error: error.message });
    toast.error('Could not save attendance. Please try again.');
    throw error;
  }
}

/** Occurrences for a class, newest first, with present/total counts. */
export async function getSessionOccurrences(classId: string): Promise<OccurrenceSummary[]> {
  const { data: occ, error } = await supabase
    .from('class_session_occurrences')
    .select('id, started_at, ended_at')
    .eq('class_id', classId)
    .order('started_at', { ascending: false });
  if (error || !occ) { log.warn('occurrences_read_error', { error: error?.message }); return []; }
  const ids = occ.map(o => o.id);
  if (ids.length === 0) return [];
  const { data: recs } = await supabase
    .from('attendance_records')
    .select('occurrence_id, status')
    .in('occurrence_id', ids);
  const total = new Map<string, number>();
  const present = new Map<string, number>();
  for (const r of (recs || [])) {
    total.set(r.occurrence_id, (total.get(r.occurrence_id) || 0) + 1);
    if (r.status !== 'absent') present.set(r.occurrence_id, (present.get(r.occurrence_id) || 0) + 1);
  }
  return occ.map(o => ({
    id: o.id, started_at: o.started_at, ended_at: o.ended_at,
    present: present.get(o.id) || 0, total: total.get(o.id) || 0,
  }));
}

/** Roster with marks for one occurrence (history detail). */
export async function getOccurrenceAttendance(occurrenceId: string): Promise<OccurrenceMark[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('roster_student_id, status, roster_students(display_name)')
    .eq('occurrence_id', occurrenceId);
  if (error) { log.warn('occurrence_detail_error', { error: error.message }); return []; }
  return (data || []).map((r: any) => ({
    roster_student_id: r.roster_student_id,
    name: r.roster_students?.display_name || 'Student',
    status: r.status as AttendanceStatus,
  }));
}
