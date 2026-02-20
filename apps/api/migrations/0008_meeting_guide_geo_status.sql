ALTER TABLE meeting_guide_meetings
  ADD COLUMN IF NOT EXISTS geo_status TEXT NOT NULL DEFAULT 'present';

ALTER TABLE meeting_guide_meetings
  DROP CONSTRAINT IF EXISTS meeting_guide_meetings_geo_status_check;

ALTER TABLE meeting_guide_meetings
  ADD CONSTRAINT meeting_guide_meetings_geo_status_check
  CHECK (geo_status IN ('present', 'missing'));

UPDATE meeting_guide_meetings
SET geo_status = 'missing'
WHERE lat IS NULL OR lng IS NULL;

CREATE INDEX IF NOT EXISTS meeting_guide_meetings_tenant_geo_status_idx
  ON meeting_guide_meetings (tenant_id, geo_status);
