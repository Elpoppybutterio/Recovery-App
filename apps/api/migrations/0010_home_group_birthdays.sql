CREATE TABLE IF NOT EXISTS home_group_birthday_memberships (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  home_group_active BOOLEAN NOT NULL DEFAULT FALSE,
  home_group_key TEXT,
  home_group_name TEXT,
  birthday_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  first_name TEXT,
  last_name TEXT,
  sobriety_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id TEXT NOT NULL,
  UNIQUE (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES users (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT home_group_birthday_memberships_active_key_check CHECK (
    (home_group_active = FALSE AND home_group_key IS NULL AND home_group_name IS NULL)
    OR (home_group_active = TRUE AND home_group_key IS NOT NULL AND home_group_name IS NOT NULL)
  ),
  CONSTRAINT home_group_birthday_memberships_opt_in_check CHECK (
    birthday_opt_in = FALSE
    OR (home_group_active = TRUE AND first_name IS NOT NULL AND sobriety_date IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS home_group_birthday_memberships_tenant_group_idx
  ON home_group_birthday_memberships (tenant_id, home_group_key)
  WHERE home_group_active = TRUE;

CREATE INDEX IF NOT EXISTS home_group_birthday_memberships_tenant_opt_in_idx
  ON home_group_birthday_memberships (tenant_id, home_group_key, sobriety_date)
  WHERE home_group_active = TRUE AND birthday_opt_in = TRUE;
