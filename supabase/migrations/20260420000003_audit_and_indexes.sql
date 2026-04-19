-- Audit logging table for admin actions and security events
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES profiles(id),
  target_type TEXT,
  target_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can only see their own logs, admins can see all
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own audit logs" ON audit_logs;
CREATE POLICY "Users read own audit logs"
  ON audit_logs FOR SELECT
  USING (actor_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all audit logs" ON audit_logs;
CREATE POLICY "Admins read all audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'teacher')
    )
  );

DROP POLICY IF EXISTS "Service insert audit logs" ON audit_logs;
CREATE POLICY "Service insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (actor_id = auth.uid());

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id) WHERE target_type IS NOT NULL;

-- Composite indexes for query optimization (Phase 5.5)
CREATE INDEX IF NOT EXISTS idx_messages_receiver_read ON messages(receiver_id, read, created_at DESC) WHERE receiver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_units_status_created ON units(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_student_status ON student_assignments(student_id, status, created_at DESC);
