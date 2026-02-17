-- TODO: replace polygon_geojson JSONB handling with PostGIS geometry once spatial stack wiring is ready.

CREATE TABLE IF NOT EXISTS exclusion_zones (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  label TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN ('CIRCLE', 'POLYGON')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_m INTEGER,
  polygon_geojson JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID NOT NULL,
  CHECK (radius_m IS NULL OR radius_m > 0)
);

CREATE TABLE IF NOT EXISTS user_zone_rules (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  zone_id UUID NOT NULL,
  buffer_m INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, user_id, zone_id),
  FOREIGN KEY (zone_id) REFERENCES exclusion_zones (id) ON DELETE CASCADE,
  CHECK (buffer_m >= 0)
);

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  zone_id UUID NOT NULL,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('WARNING', 'VIOLATION')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (zone_id) REFERENCES exclusion_zones (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'SMS')),
  recipient TEXT NOT NULL,
  template_key TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exclusion_zones_tenant_active_idx
  ON exclusion_zones (tenant_id, active);

CREATE INDEX IF NOT EXISTS user_zone_rules_tenant_user_active_idx
  ON user_zone_rules (tenant_id, user_id, active);

CREATE INDEX IF NOT EXISTS incidents_tenant_user_occurred_at_desc_idx
  ON incidents (tenant_id, user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS incidents_tenant_status_occurred_at_desc_idx
  ON incidents (tenant_id, status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS notification_events_tenant_status_created_at_idx
  ON notification_events (tenant_id, status, created_at);
