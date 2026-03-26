# Manual Access Grants

Sober² now stores participant and protected admin/supervisory access grants in Postgres. The onboarding splash only selects intended flow. It does not grant protected authority.

## Where Grants Live

- User identity: `users`
- Organization scopes: `organizations`
- Court/program scopes: `court_programs`
- Access grants: `user_roles`

Protected access is read by the mobile app from `GET /v1/me/access-context`.

## Grant a Platform Owner

```sql
INSERT INTO user_roles (
  tenant_id,
  user_id,
  role,
  is_active,
  granted_by_user_id
)
VALUES (
  'tenant-a',
  'admin-a',
  'platform_owner',
  TRUE,
  'admin-a'
)
ON CONFLICT DO NOTHING;
```

## Grant an Organization Admin

```sql
INSERT INTO organizations (id, tenant_id, name)
VALUES ('org-alpine', 'tenant-a', 'Alpine Recovery Housing')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (
  tenant_id,
  user_id,
  role,
  organization_id,
  is_active,
  granted_by_user_id
)
VALUES (
  'tenant-a',
  'manager-a',
  'org_admin',
  'org-alpine',
  TRUE,
  'admin-a'
)
ON CONFLICT DO NOTHING;
```

## Grant Court-Supervisory Access

```sql
INSERT INTO court_programs (id, tenant_id, name, jurisdiction)
VALUES ('court-boulder', 'tenant-a', 'Boulder Recovery Court', 'Boulder County')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (
  tenant_id,
  user_id,
  role,
  court_program_id,
  is_active,
  granted_by_user_id
)
VALUES
  ('tenant-a', 'officer-a', 'probation_officer', 'court-boulder', TRUE, 'admin-a'),
  ('tenant-a', 'supervisor-a', 'court_supervisor', 'court-boulder', TRUE, 'admin-a')
ON CONFLICT DO NOTHING;
```

## Revoke or Deactivate a Grant

```sql
UPDATE user_roles
SET is_active = FALSE,
    revoked_at = NOW()
WHERE tenant_id = 'tenant-a'
  AND user_id = 'manager-a'
  AND role = 'org_admin'
  AND organization_id = 'org-alpine'
  AND revoked_at IS NULL;
```

## Expected Flow

1. User signs up or signs in.
2. Find the user in `users.id`.
3. Insert the correct scoped row into `user_roles`.
4. On the next authenticated `/v1/me/access-context` fetch, protected access unlocks for authorized users only.
