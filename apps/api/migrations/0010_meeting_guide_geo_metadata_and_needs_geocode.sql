ALTER TABLE meeting_guide_meetings
  ADD COLUMN IF NOT EXISTS geo_source TEXT;

ALTER TABLE meeting_guide_meetings
  ADD COLUMN IF NOT EXISTS geo_confidence DOUBLE PRECISION;

ALTER TABLE meeting_guide_meetings
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

ALTER TABLE meeting_guide_meetings
  DROP CONSTRAINT IF EXISTS meeting_guide_meetings_geo_status_check;

ALTER TABLE meeting_guide_meetings
  ADD CONSTRAINT meeting_guide_meetings_geo_status_check
  CHECK (geo_status IN ('ok', 'missing', 'invalid', 'partial', 'needs_geocode'));

UPDATE meeting_guide_meetings
SET
  lat = CASE
    WHEN lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 AND NOT (lat = 0 AND lng = 0)
      THEN lat
    ELSE NULL
  END,
  lng = CASE
    WHEN lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 AND NOT (lat = 0 AND lng = 0)
      THEN lng
    ELSE NULL
  END,
  geo_status = CASE
    WHEN lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 AND NOT (lat = 0 AND lng = 0)
      THEN 'ok'
    WHEN COALESCE(NULLIF(BTRIM(formatted_address), ''), NULLIF(BTRIM(address), '')) IS NOT NULL
      THEN 'needs_geocode'
    WHEN lat IS NULL AND lng IS NULL
      THEN 'missing'
    WHEN lat IS NULL OR lng IS NULL
      THEN 'partial'
    ELSE 'invalid'
  END,
  geo_reason = CASE
    WHEN lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 AND NOT (lat = 0 AND lng = 0)
      THEN geo_reason
    WHEN lat = 0 AND lng = 0
      THEN 'zero_coordinates'
    WHEN lat IS NOT NULL AND (lat < -90 OR lat > 90)
      THEN 'coordinate_out_of_range'
    WHEN lng IS NOT NULL AND (lng < -180 OR lng > 180)
      THEN 'coordinate_out_of_range'
    WHEN lat IS NULL AND lng IS NULL AND COALESCE(NULLIF(BTRIM(formatted_address), ''), NULLIF(BTRIM(address), '')) IS NOT NULL
      THEN 'missing_coordinates'
    WHEN lat IS NULL AND lng IS NULL
      THEN 'missing_address'
    WHEN lat IS NULL
      THEN 'missing_latitude'
    WHEN lng IS NULL
      THEN 'missing_longitude'
    ELSE geo_reason
  END,
  geo_source = CASE
    WHEN lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 AND NOT (lat = 0 AND lng = 0)
      THEN COALESCE(NULLIF(BTRIM(geo_source), ''), 'feed')
    ELSE geo_source
  END,
  geo_confidence = CASE
    WHEN geo_confidence IS NULL THEN NULL
    WHEN geo_confidence < 0 THEN 0
    WHEN geo_confidence > 1 THEN 1
    ELSE geo_confidence
  END,
  geo_updated_at = COALESCE(geo_updated_at, NOW());

CREATE INDEX IF NOT EXISTS meeting_guide_meetings_tenant_geo_status_geocode_idx
  ON meeting_guide_meetings (tenant_id, geo_status, geocoded_at);
