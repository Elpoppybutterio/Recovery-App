# Meeting Guide Ingest

## Model

This app ingests distributed Meeting Guide/TSML-style JSON feeds. It does not depend on a single global radius API.

- Source feeds are configured by env (`MEETING_GUIDE_FEEDS_JSON`) and cached in `meeting_feeds`.
- Normalized meetings are stored in `meeting_guide_meetings`.
- Nearby search is done server-side with radius filtering from query coordinates.

## Feed Config

Use `MEETING_GUIDE_FEEDS_JSON` as a JSON array:

```bash
MEETING_GUIDE_FEEDS_JSON='[{"name":"Example Intergroup","url":"https://example.org/meetings.json","tenantId":"tenant-a"}]'
```

For local dev (no external feed required), use the built-in Billings test feed:

```bash
MEETING_GUIDE_FEEDS_JSON='[{"name":"Billings Test Feed","url":"builtin://billings-test","tenantId":"tenant-a"}]'
```

Optional env:

- `MEETING_GUIDE_DEFAULT_TENANT_ID=tenant-a`
- `MEETING_GUIDE_AUTO_INGEST=true`
- `MEETING_GUIDE_REFRESH_INTERVAL_MS=43200000` (12 hours)

Legacy feed env vars are still supported as fallback:

- `MEETING_FEEDS_AA` (comma-separated URLs)
- `MEETING_FEEDS_NA` (comma-separated URLs)

## Refresh

- Automatic refresh runs every 12 hours when auto-ingest is enabled.
- Manual refresh (admin route): `POST /v1/admin/meetings/refresh`
  - In non-production, `Authorization: Bearer DEV_<userId>` can bypass ADMIN role for this route.
- Dev refresh route (non-production + DEV auth only): `POST /v1/dev/meetings/refresh`
- Dev ingest diagnostics (non-production + DEV auth only): `GET /v1/dev/meetings/status`

## Nearby API

`GET /v1/meetings/nearby?lat=...&lng=...&radiusMiles=20`

Optional filters:

- `format=in_person|online|any`
- `dayOfWeek=0..6`
- `types=O,SP`
- `timeFrom=HH:MM`
- `timeTo=HH:MM`

Notes:

- `/v1/meetings/nearby` excludes meetings without coordinates.
- During ingest, meetings missing `lat/lng` are stored with `geo_status=missing`.
- This prevents map/radius leakage from non-geocoded rows.

## Billings Runbook

```bash
# 1) Start API
pnpm -C apps/api dev

# 2) Trigger dev ingest
curl -X POST http://localhost:3001/v1/dev/meetings/refresh \
  -H "Authorization: Bearer DEV_enduser-a1"

# 3) Inspect ingest stats and sample nearby meetings
curl "http://localhost:3001/v1/dev/meetings/status?lat=45.7833&lng=-108.5007&radiusMiles=20" \
  -H "Authorization: Bearer DEV_enduser-a1"

# 4) Query nearby endpoint directly
curl "http://localhost:3001/v1/meetings/nearby?lat=45.7833&lng=-108.5007&radiusMiles=20" \
  -H "Authorization: Bearer DEV_enduser-a1"
```

## Privacy / Anonymity

- No attendee identities are ingested or exposed.
- Stored fields are limited to feed-level meeting metadata.
- Do not add personal phone lists or last names outside feed-provided public meeting metadata.
