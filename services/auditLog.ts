import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';

const log = createClientLogger('AuditLog');

export type AuditAction =
  | 'user.login'
  | 'user.logout'
  | 'user.signup'
  | 'class.create'
  | 'class.update'
  | 'class.delete'
  | 'class.enroll'
  | 'unit.create'
  | 'unit.update'
  | 'unit.delete'
  | 'unit.publish'
  | 'student.progress_update'
  | 'admin.view_dashboard'
  | 'admin.update_settings'
  | 'admin.manage_user'
  | 'shop.purchase'
  | 'quest.claim';

interface AuditEntry {
  action: AuditAction;
  actorId: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

const queue: AuditEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY = 5000;
const MAX_QUEUE = 20;

export async function auditLog(entry: AuditEntry): Promise<void> {
  queue.push(entry);

  if (queue.length >= MAX_QUEUE) {
    await flushAuditLog();
    return;
  }

  if (!flushTimer) {
    flushTimer = setTimeout(flushAuditLog, FLUSH_DELAY);
  }
}

export async function flushAuditLog(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (queue.length === 0) return;

  const batch = queue.splice(0);
  const rows = batch.map((entry) => ({
    action: entry.action,
    actor_id: entry.actorId,
    target_type: entry.targetType || null,
    target_id: entry.targetId || null,
    metadata: entry.metadata || null,
    created_at: new Date().toISOString(),
  }));

  try {
    const { error } = await supabase.from('audit_logs').insert(rows);
    if (error) {
      log.error('flush_failed', { error: error.message });
      queue.push(...batch);
    }
  } catch (err) {
    log.error('flush_exception', { error: String(err) });
    queue.push(...batch);
  }
}
