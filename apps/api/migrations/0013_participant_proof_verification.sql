ALTER TABLE participant_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE participant_profiles AS profiles
SET display_name = users.display_name
FROM users
WHERE users.tenant_id = profiles.tenant_id
  AND users.id = profiles.user_id
  AND profiles.display_name IS NULL;

ALTER TABLE obligations
  ADD COLUMN IF NOT EXISTS proof_type TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED';

ALTER TABLE obligations
  DROP CONSTRAINT IF EXISTS obligations_proof_type_check;

ALTER TABLE obligations
  ADD CONSTRAINT obligations_proof_type_check
  CHECK (
    proof_type IS NULL OR proof_type IN (
      'signature',
      'photo',
      'selfie',
      'geofence',
      'qr_or_code',
      'officer_verification',
      'staff_verification',
      'document_upload'
    )
  );

ALTER TABLE obligations
  DROP CONSTRAINT IF EXISTS obligations_verification_status_check;

ALTER TABLE obligations
  ADD CONSTRAINT obligations_verification_status_check
  CHECK (
    verification_status IN (
      'NOT_REQUIRED',
      'PENDING',
      'SUBMITTED',
      'VERIFIED',
      'REJECTED',
      'WAIVED'
    )
  );

UPDATE obligations
SET verification_status = CASE
  WHEN requires_proof THEN 'PENDING'
  ELSE 'NOT_REQUIRED'
END
WHERE verification_status IS NULL;

ALTER TABLE compliance_events
  ADD COLUMN IF NOT EXISTS proof_metadata_json JSONB,
  ADD COLUMN IF NOT EXISTS proof_type TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT,
  ADD COLUMN IF NOT EXISTS verified_by_role TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE compliance_events
  DROP CONSTRAINT IF EXISTS compliance_events_event_type_check;

ALTER TABLE compliance_events
  ADD CONSTRAINT compliance_events_event_type_check
  CHECK (
    event_type IN (
      'APP_REMOVED',
      'PERMISSION_REVOKED',
      'LOCATION_STALE',
      'MEETING_ATTENDED',
      'MEETING_MISSED',
      'SPONSOR_CONTACT_COMPLETED',
      'SPONSOR_CONTACT_MISSED',
      'TREATMENT_SESSION_ATTENDED',
      'TREATMENT_SESSION_MISSED',
      'COURT_APPEARANCE_ATTENDED',
      'COURT_APPEARANCE_MISSED',
      'DRUG_TEST_COMPLETED',
      'DRUG_TEST_MISSED',
      'CHORE_COMPLETED',
      'CHORE_MISSED',
      'CURFEW_CHECK_PASSED',
      'CURFEW_VIOLATION_DETECTED',
      'SERVICE_COMMITMENT_COMPLETED',
      'PROOF_UPLOADED',
      'SIGNATURE_CAPTURED',
      'GEOFENCE_ENTERED',
      'GEOFENCE_EXITED',
      'OBLIGATION_ACKNOWLEDGED',
      'OBLIGATION_MISSED',
      'ADMIN_NOTE_ADDED',
      'OBLIGATION_SYNCED'
    )
  );

ALTER TABLE compliance_events
  DROP CONSTRAINT IF EXISTS compliance_events_event_status_check;

ALTER TABLE compliance_events
  ADD CONSTRAINT compliance_events_event_status_check
  CHECK (
    event_status IS NULL OR event_status IN (
      'COMPLETED',
      'MISSED',
      'PASSED',
      'FAILED',
      'UPLOADED',
      'CAPTURED',
      'ENTERED',
      'EXITED',
      'ACKNOWLEDGED',
      'VERIFIED',
      'REJECTED',
      'NOTED'
    )
  );

ALTER TABLE compliance_events
  DROP CONSTRAINT IF EXISTS compliance_events_proof_type_check;

ALTER TABLE compliance_events
  ADD CONSTRAINT compliance_events_proof_type_check
  CHECK (
    proof_type IS NULL OR proof_type IN (
      'signature',
      'photo',
      'selfie',
      'geofence',
      'qr_or_code',
      'officer_verification',
      'staff_verification',
      'document_upload'
    )
  );

ALTER TABLE compliance_events
  DROP CONSTRAINT IF EXISTS compliance_events_verification_status_check;

ALTER TABLE compliance_events
  ADD CONSTRAINT compliance_events_verification_status_check
  CHECK (
    verification_status IS NULL OR verification_status IN (
      'NOT_REQUIRED',
      'PENDING',
      'SUBMITTED',
      'VERIFIED',
      'REJECTED',
      'WAIVED'
    )
  );

UPDATE compliance_events
SET verification_status = CASE
  WHEN signature_present THEN 'VERIFIED'
  WHEN proof_uri IS NOT NULL THEN 'SUBMITTED'
  ELSE NULL
END
WHERE verification_status IS NULL;

ALTER TABLE violations
  DROP CONSTRAINT IF EXISTS violations_violation_type_check;

ALTER TABLE violations
  ADD CONSTRAINT violations_violation_type_check
  CHECK (
    violation_type IN (
      'missed_meeting',
      'missed_treatment',
      'missed_test',
      'missed_sponsor_contact',
      'missed_chore',
      'missed_curfew',
      'missing_signature',
      'missing_proof',
      'failed_identity_verification',
      'other'
    )
  );

CREATE INDEX IF NOT EXISTS obligations_proof_scope_idx
  ON obligations (tenant_id, proof_type, verification_status, status, due_at);

CREATE INDEX IF NOT EXISTS compliance_events_verification_scope_idx
  ON compliance_events (tenant_id, proof_type, verification_status, occurred_at DESC);
