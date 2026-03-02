ALTER TABLE meeting_guide_meetings
  ADD COLUMN IF NOT EXISTS geo_status TEXT NOT NULL DEFAULT 'missing';

ALTER TABLE meeting_guide_meetings
  ADD COLUMN IF NOT EXISTS geo_reason TEXT;

ALTER TABLE meeting_guide_meetings
  ADD COLUMN IF NOT EXISTS geo_updated_at TIMESTAMPTZ;

ALTER TABLE meeting_guide_meetings
  DROP CONSTRAINT IF EXISTS meeting_guide_meetings_geo_status_check;

UPDATE meeting_guide_meetings
SET
  geo_status = CASE
    WHEN geo_status = 'present' THEN 'ok'
    WHEN geo_status IN ('ok', 'missing', 'invalid', 'partial') THEN geo_status
    WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 'ok'
    WHEN lat IS NULL AND lng IS NULL THEN 'missing'
    ELSE 'partial'
  END,
  geo_reason = CASE
    WHEN lat IS NOT NULL AND lng IS NOT NULL THEN NULL
    WHEN geo_reason IS NOT NULL THEN geo_reason
    WHEN lat IS NULL AND lng IS NULL THEN 'missing_coordinates'
    WHEN lat IS NULL THEN 'missing_latitude'
    WHEN lng IS NULL THEN 'missing_longitude'
    ELSE NULL
  END,
  geo_updated_at = COALESCE(geo_updated_at, updated_at_source, last_ingested_at, NOW());

ALTER TABLE meeting_guide_meetings
  ADD CONSTRAINT meeting_guide_meetings_geo_status_check
  CHECK (geo_status IN ('ok', 'missing', 'invalid', 'partial'));

CREATE INDEX IF NOT EXISTS meeting_guide_meetings_tenant_geo_status_updated_idx
  ON meeting_guide_meetings (tenant_id, geo_status, geo_updated_at);
