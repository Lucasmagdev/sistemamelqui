CREATE TABLE IF NOT EXISTS assistant_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  conversation_id VARCHAR(120),
  admin_auth_user_id UUID,
  admin_profile_id BIGINT,
  admin_email VARCHAR(120),
  question TEXT NOT NULL,
  resolved_intent JSONB NOT NULL DEFAULT '{}'::jsonb,
  tools_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL CHECK (status IN ('answer', 'clarification', 'error')),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_audit_logs_created_at
  ON assistant_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_audit_logs_admin_auth_user
  ON assistant_audit_logs (admin_auth_user_id, created_at DESC);
