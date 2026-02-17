CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_m INTEGER NOT NULL CHECK (radius_m > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id TEXT NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  meeting_id UUID NOT NULL,
  check_in_at TIMESTAMPTZ NOT NULL,
  check_out_at TIMESTAMPTZ,
  dwell_seconds INTEGER,
  status TEXT NOT NULL CHECK (status IN ('INCOMPLETE', 'PROVISIONAL', 'VERIFIED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, meeting_id) REFERENCES meetings (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verifier_signatures (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  attendance_id UUID NOT NULL,
  verifier_user_id TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL,
  signature_blob TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, attendance_id),
  FOREIGN KEY (tenant_id, attendance_id) REFERENCES attendance (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, verifier_user_id) REFERENCES users (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS meetings_tenant_idx
  ON meetings (tenant_id);

CREATE INDEX IF NOT EXISTS attendance_tenant_user_check_in_idx
  ON attendance (tenant_id, user_id, check_in_at DESC);

CREATE INDEX IF NOT EXISTS attendance_tenant_meeting_check_in_idx
  ON attendance (tenant_id, meeting_id, check_in_at DESC);

CREATE INDEX IF NOT EXISTS verifier_signatures_tenant_attendance_idx
  ON verifier_signatures (tenant_id, attendance_id);
