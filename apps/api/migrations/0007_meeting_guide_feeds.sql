CREATE TABLE IF NOT EXISTS meeting_feeds (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  entity TEXT,
  entity_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  etag TEXT,
  last_modified TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, url)
);

CREATE TABLE IF NOT EXISTS meeting_guide_meetings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  source_feed_id UUID NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  day SMALLINT,
  time TEXT,
  end_time TEXT,
  timezone TEXT,
  formatted_address TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  region TEXT,
  location TEXT,
  notes TEXT,
  types_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  conference_url TEXT,
  conference_phone TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  updated_at_source TIMESTAMPTZ,
  last_ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, source_feed_id, slug),
  FOREIGN KEY (tenant_id, source_feed_id) REFERENCES meeting_feeds (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS meeting_feeds_tenant_active_idx
  ON meeting_feeds (tenant_id, active);

CREATE INDEX IF NOT EXISTS meeting_guide_meetings_tenant_day_time_idx
  ON meeting_guide_meetings (tenant_id, day, time);

CREATE INDEX IF NOT EXISTS meeting_guide_meetings_tenant_lat_lng_idx
  ON meeting_guide_meetings (tenant_id, lat, lng);
