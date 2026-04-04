CREATE TABLE IF NOT EXISTS sober_house_alert_acknowledgements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  house_id TEXT REFERENCES houses (id) ON DELETE CASCADE,
  resident_user_id TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACKNOWLEDGED' CHECK (status IN ('PENDING', 'ACKNOWLEDGED', 'WAIVED')),
  acknowledged_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, resident_user_id, alert_id),
  FOREIGN KEY (tenant_id, resident_user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sober_house_alert_acknowledgements_scope_idx
  ON sober_house_alert_acknowledgements (
    tenant_id,
    organization_id,
    house_id,
    resident_user_id,
    status,
    acknowledged_at DESC
  );
