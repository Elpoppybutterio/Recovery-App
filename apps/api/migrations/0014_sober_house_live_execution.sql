CREATE TABLE IF NOT EXISTS resident_house_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  house_id TEXT NOT NULL REFERENCES houses (id) ON DELETE CASCADE,
  resident_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, house_id, resident_user_id),
  FOREIGN KEY (tenant_id, resident_user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE
);

INSERT INTO resident_house_memberships (
  id,
  tenant_id,
  organization_id,
  house_id,
  resident_user_id,
  status
)
SELECT
  CONCAT('rhm:', profiles.tenant_id, ':', profiles.house_id, ':', profiles.user_id),
  profiles.tenant_id,
  profiles.organization_id,
  profiles.house_id,
  profiles.user_id,
  CASE
    WHEN profiles.status = 'ACTIVE' THEN 'ACTIVE'
    ELSE 'INACTIVE'
  END
FROM participant_profiles AS profiles
WHERE profiles.participant_type = 'resident_user'
  AND profiles.organization_id IS NOT NULL
  AND profiles.house_id IS NOT NULL
ON CONFLICT (tenant_id, house_id, resident_user_id)
DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  status = EXCLUDED.status,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS sober_house_obligations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  house_id TEXT NOT NULL REFERENCES houses (id) ON DELETE CASCADE,
  resident_user_id TEXT NOT NULL,
  resident_house_membership_id TEXT REFERENCES resident_house_memberships (id) ON DELETE SET NULL,
  obligation_type TEXT NOT NULL CHECK (obligation_type IN ('HOUSE_MEETING', 'ONE_ON_ONE', 'CHORE')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ,
  proof_required BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (tenant_id, resident_user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE,
  CHECK (due_at IS NULL OR due_at >= scheduled_at)
);

CREATE TABLE IF NOT EXISTS sober_house_completion_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  house_id TEXT NOT NULL REFERENCES houses (id) ON DELETE CASCADE,
  resident_user_id TEXT NOT NULL,
  obligation_id TEXT NOT NULL REFERENCES sober_house_obligations (id) ON DELETE CASCADE,
  completion_status TEXT NOT NULL CHECK (completion_status IN ('SCHEDULED', 'COMPLETED', 'MISSED', 'EXCUSED')),
  completed_at TIMESTAMPTZ,
  proof_metadata_json JSONB,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, obligation_id),
  FOREIGN KEY (tenant_id, resident_user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sober_house_proof_reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  house_id TEXT NOT NULL REFERENCES houses (id) ON DELETE CASCADE,
  resident_user_id TEXT NOT NULL,
  completion_record_id TEXT NOT NULL REFERENCES sober_house_completion_records (id) ON DELETE CASCADE,
  review_outcome TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    review_outcome IN ('PENDING', 'APPROVED', 'REJECTED', 'FOLLOW_UP_REQUIRED')
  ),
  reviewer_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (completion_record_id),
  FOREIGN KEY (tenant_id, resident_user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, reviewer_user_id) REFERENCES users (tenant_id, id) ON DELETE SET NULL,
  CHECK (
    (review_outcome = 'PENDING' AND reviewer_user_id IS NULL AND reviewed_at IS NULL)
    OR review_outcome <> 'PENDING'
  )
);

CREATE INDEX IF NOT EXISTS resident_house_memberships_scope_idx
  ON resident_house_memberships (tenant_id, organization_id, house_id, resident_user_id, status);

CREATE INDEX IF NOT EXISTS sober_house_obligations_scope_idx
  ON sober_house_obligations (
    tenant_id,
    organization_id,
    house_id,
    resident_user_id,
    status,
    scheduled_at,
    due_at
  );

CREATE INDEX IF NOT EXISTS sober_house_completion_records_scope_idx
  ON sober_house_completion_records (
    tenant_id,
    organization_id,
    house_id,
    resident_user_id,
    completion_status,
    submitted_at DESC
  );

CREATE INDEX IF NOT EXISTS sober_house_proof_reviews_pending_idx
  ON sober_house_proof_reviews (
    tenant_id,
    organization_id,
    house_id,
    review_outcome,
    resident_user_id,
    created_at DESC
  );
