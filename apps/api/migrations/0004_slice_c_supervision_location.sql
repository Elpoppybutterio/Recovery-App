ALTER TABLE users
  ADD COLUMN IF NOT EXISTS supervision_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS supervision_end_date TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS last_known_locations (
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'MOBILE',
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS compliance_events (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('APP_REMOVED', 'PERMISSION_REVOKED', 'LOCATION_STALE')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS last_known_locations_tenant_recorded_at_desc_idx
  ON last_known_locations (tenant_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS compliance_events_tenant_user_occurred_at_desc_idx
  ON compliance_events (tenant_id, user_id, occurred_at DESC);
