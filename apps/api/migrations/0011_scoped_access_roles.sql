CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS court_programs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  jurisdiction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, id)
);

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS organization_id TEXT,
  ADD COLUMN IF NOT EXISTS court_program_id TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS granted_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_tenant_id_user_id_role_key;

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_organization_fk;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL;

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_court_program_fk;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_court_program_fk
  FOREIGN KEY (court_program_id) REFERENCES court_programs (id) ON DELETE SET NULL;

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_granted_by_fk;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_granted_by_fk
  FOREIGN KEY (tenant_id, granted_by_user_id) REFERENCES users (tenant_id, id) ON DELETE SET NULL;

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_single_scope_check;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_single_scope_check
  CHECK (organization_id IS NULL OR court_program_id IS NULL);

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_scope_check;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_role_scope_check
  CHECK (
    (role IN ('recovery_user', 'platform_owner') AND organization_id IS NULL AND court_program_id IS NULL)
    OR (role IN ('resident_user', 'org_admin', 'house_manager') AND organization_id IS NOT NULL AND court_program_id IS NULL)
    OR (role IN ('court_participant', 'probation_officer', 'parole_officer', 'court_supervisor')
      AND organization_id IS NULL
      AND court_program_id IS NOT NULL)
    OR (role NOT IN (
      'recovery_user',
      'resident_user',
      'court_participant',
      'org_admin',
      'house_manager',
      'probation_officer',
      'parole_officer',
      'court_supervisor',
      'platform_owner'
    ))
  );

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_active_scope_unique_idx
  ON user_roles (
    tenant_id,
    user_id,
    role,
    COALESCE(organization_id, ''),
    COALESCE(court_program_id, '')
  )
  WHERE is_active = TRUE AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS user_roles_active_lookup_idx
  ON user_roles (tenant_id, user_id, is_active, granted_at DESC);

CREATE INDEX IF NOT EXISTS organizations_tenant_name_idx
  ON organizations (tenant_id, name);

CREATE INDEX IF NOT EXISTS court_programs_tenant_name_idx
  ON court_programs (tenant_id, name);

COMMENT ON TABLE user_roles IS
  'Stores backend-authorized participant and protected access grants. Onboarding flow selection must never be treated as role truth.';
