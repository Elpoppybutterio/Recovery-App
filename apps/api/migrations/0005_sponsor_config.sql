CREATE TABLE IF NOT EXISTS sponsor_config (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  sponsor_name TEXT NOT NULL,
  sponsor_phone_e164 TEXT NOT NULL,
  call_time_local_hhmm TEXT NOT NULL,
  repeat_rule TEXT NOT NULL CHECK (repeat_rule IN ('DAILY', 'WEEKDAYS', 'WEEKLY', 'BIWEEKLY', 'MONTHLY')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id TEXT NOT NULL,
  UNIQUE (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES users (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS sponsor_config_tenant_user_idx
  ON sponsor_config (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS sponsor_config_tenant_active_idx
  ON sponsor_config (tenant_id, active);
