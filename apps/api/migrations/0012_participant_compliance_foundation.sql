CREATE TABLE IF NOT EXISTS houses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS participant_profiles (
  user_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  participant_type TEXT NOT NULL CHECK (
    participant_type IN ('recovery_user', 'resident_user', 'court_participant')
  ),
  organization_id TEXT REFERENCES organizations (id) ON DELETE SET NULL,
  house_id TEXT REFERENCES houses (id) ON DELETE SET NULL,
  court_program_id TEXT REFERENCES court_programs (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (
    status IN ('PENDING', 'ACTIVE', 'PAUSED', 'INACTIVE')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE,
  CHECK (house_id IS NULL OR organization_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS obligations (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  obligation_type TEXT NOT NULL CHECK (
    obligation_type IN (
      'meeting_attendance',
      'sponsor_contact',
      'treatment_session',
      'court_appearance',
      'drug_test',
      'chore',
      'curfew',
      'service_commitment',
      'proof_submission',
      'other'
    )
  ),
  source_track TEXT NOT NULL CHECK (
    source_track IN ('recovery', 'resident', 'court', 'service', 'treatment', 'sponsor', 'operations', 'other')
  ),
  title TEXT NOT NULL,
  description TEXT,
  organization_id TEXT REFERENCES organizations (id) ON DELETE SET NULL,
  house_id TEXT REFERENCES houses (id) ON DELETE SET NULL,
  court_program_id TEXT REFERENCES court_programs (id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  recurrence_json JSONB,
  priority TEXT CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  requires_proof BOOLEAN NOT NULL DEFAULT FALSE,
  requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (
    status IN ('ACTIVE', 'COMPLETED', 'MISSED', 'CANCELED', 'WAIVED')
  ),
  sync_source TEXT,
  sync_key TEXT,
  created_by_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE,
  CHECK (house_id IS NULL OR organization_id IS NOT NULL)
);

ALTER TABLE compliance_events
  ADD COLUMN IF NOT EXISTS obligation_id UUID REFERENCES obligations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS house_id TEXT REFERENCES houses (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS court_program_id TEXT REFERENCES court_programs (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_status TEXT,
  ADD COLUMN IF NOT EXISTS proof_uri TEXT,
  ADD COLUMN IF NOT EXISTS signature_present BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_by_role TEXT,
  ADD COLUMN IF NOT EXISTS source_track TEXT,
  ADD COLUMN IF NOT EXISTS external_event_id TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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
      'NOTED'
    )
  );

CREATE TABLE IF NOT EXISTS violations (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  obligation_id UUID REFERENCES obligations (id) ON DELETE SET NULL,
  organization_id TEXT REFERENCES organizations (id) ON DELETE SET NULL,
  house_id TEXT REFERENCES houses (id) ON DELETE SET NULL,
  court_program_id TEXT REFERENCES court_programs (id) ON DELETE SET NULL,
  violation_type TEXT NOT NULL CHECK (
    violation_type IN (
      'missed_meeting',
      'missed_treatment',
      'missed_test',
      'missed_sponsor_contact',
      'missed_chore',
      'missed_curfew',
      'missing_signature',
      'missing_proof',
      'other'
    )
  ),
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (
    status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED')
  ),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  detected_from_event_id UUID REFERENCES compliance_events (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE,
  CHECK (house_id IS NULL OR organization_id IS NOT NULL)
);

ALTER TABLE obligations
  DROP CONSTRAINT IF EXISTS obligations_mobile_sync_unique;

ALTER TABLE obligations
  ADD CONSTRAINT obligations_mobile_sync_unique
  UNIQUE (tenant_id, user_id, sync_source, sync_key);

ALTER TABLE compliance_events
  DROP CONSTRAINT IF EXISTS compliance_events_external_event_unique;

ALTER TABLE compliance_events
  ADD CONSTRAINT compliance_events_external_event_unique
  UNIQUE (tenant_id, user_id, external_event_id);

ALTER TABLE violations
  DROP CONSTRAINT IF EXISTS violations_detected_from_event_unique;

ALTER TABLE violations
  ADD CONSTRAINT violations_detected_from_event_unique
  UNIQUE (detected_from_event_id);

CREATE INDEX IF NOT EXISTS participant_profiles_scope_idx
  ON participant_profiles (tenant_id, organization_id, house_id, court_program_id, status);

CREATE INDEX IF NOT EXISTS obligations_scope_due_idx
  ON obligations (tenant_id, organization_id, house_id, court_program_id, status, due_at);

CREATE INDEX IF NOT EXISTS compliance_events_scope_occurred_idx
  ON compliance_events (tenant_id, organization_id, house_id, court_program_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS violations_scope_detected_idx
  ON violations (tenant_id, organization_id, house_id, court_program_id, status, detected_at DESC);
