ALTER TABLE meeting_guide_meetings
  ADD COLUMN IF NOT EXISTS geo_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_meeting_guide_meetings_geo_reason
  ON meeting_guide_meetings (geo_reason);
