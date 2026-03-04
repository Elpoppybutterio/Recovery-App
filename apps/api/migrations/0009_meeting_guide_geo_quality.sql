ALTER TABLE meeting_guide_meetings
  ADD COLUMN IF NOT EXISTS geo_reason TEXT;

ALTER TABLE meeting_guide_meetings
  ADD COLUMN IF NOT EXISTS geo_updated_at TIMESTAMPTZ;

ALTER TABLE meeting_guide_meetings
  DROP CONSTRAINT IF EXISTS meeting_guide_meetings_geo_status_check;

UPDATE meeting_guide_meetings
SET
  geo_status = CASE
    WHEN lat IS NULL AND lng IS NULL THEN 'missing'
    WHEN lat IS NULL OR lng IS NULL THEN 'partial'
    WHEN lat BETWEEN -90 AND 90
      AND lng BETWEEN -180 AND 180
      AND NOT (lat = 0 AND lng = 0) THEN 'ok'
    ELSE 'invalid'
  END,
  geo_reason = CASE
    WHEN lat IS NULL AND lng IS NULL THEN 'missing_coordinates'
    WHEN lat IS NULL THEN 'missing_latitude'
    WHEN lng IS NULL THEN 'missing_longitude'
    WHEN lat = 0 AND lng = 0 THEN 'zero_coordinates'
    WHEN lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180 THEN 'coordinate_out_of_range'
    ELSE NULL
  END,
  geo_updated_at = COALESCE(geo_updated_at, NOW());

ALTER TABLE meeting_guide_meetings
  ADD CONSTRAINT meeting_guide_meetings_geo_status_check
  CHECK (geo_status IN ('ok', 'missing', 'invalid', 'partial'));

CREATE INDEX IF NOT EXISTS meeting_guide_meetings_tenant_geo_status_updated_idx
  ON meeting_guide_meetings (tenant_id, geo_status, geo_updated_at);
