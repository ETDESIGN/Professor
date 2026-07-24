import type { AttendanceStatus } from './AttendanceService';

/** A student is present unless explicitly marked 'absent'. Missing = present (opt-in). */
export function isPresentStatus(status: AttendanceStatus | undefined): boolean {
  return status !== 'absent';
}

/** Stamp isPresent onto each roster student from an attendance map (rosterId → status). */
export function mergePresence<T extends { id: string }>(
  roster: T[],
  attendance: Map<string, AttendanceStatus>,
): (T & { isPresent: boolean })[] {
  return roster.map(s => ({ ...s, isPresent: isPresentStatus(attendance.get(s.id)) }));
}

/** Only students who are present (isPresent !== false; undefined counts as present). */
export function filterPresent<T extends { isPresent?: boolean }>(students: T[]): T[] {
  return students.filter(s => s.isPresent !== false);
}

/** Full present/absent status map for every roster id, given the present set. */
export function buildStatuses(rosterIds: string[], presentIds: Set<string>): Map<string, AttendanceStatus> {
  const m = new Map<string, AttendanceStatus>();
  for (const id of rosterIds) m.set(id, presentIds.has(id) ? 'present' : 'absent');
  return m;
}

/** Present/absent counts for the modal header. */
export function summarize(rosterIds: string[], presentIds: Set<string>): { present: number; absent: number } {
  let present = 0;
  for (const id of rosterIds) if (presentIds.has(id)) present++;
  return { present, absent: rosterIds.length - present };
}
