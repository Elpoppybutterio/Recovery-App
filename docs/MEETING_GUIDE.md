# Meeting Guide Ingest

## Model

This app ingests distributed Meeting Guide/TSML-style JSON feeds. It does not depend on a single global radius API.

- Source feeds are configured by env (`MEETING_GUIDE_FEEDS_JSON`) and cached in `meeting_feeds`.
- Normalized meetings are stored in `meeting_guide_meetings`.
- Nearby search is done server-side with radius filtering from query coordinates.

## Feed Config

Use `MEETING_GUIDE_FEEDS_JSON` as a JSON array:

```bash
MEETING_GUIDE_FEEDS_JSON='[{"name":"Example Intergroup","url":"https://example.org/meetings/?tsml=1","tenantId":"tenant-a"}]'
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
- Manual refresh: `POST /v1/admin/meetings/refresh` (ADMIN only).

## Nearby API

`GET /v1/meetings/nearby?lat=...&lng=...&radiusMiles=20`

Optional filters:

- `format=in_person|online|any`
- `dayOfWeek=0..6`
- `types=O,SP`
- `timeFrom=HH:MM`
- `timeTo=HH:MM`

## Privacy / Anonymity

- No attendee identities are ingested or exposed.
- Stored fields are limited to feed-level meeting metadata.
- Do not add personal phone lists or last names outside feed-provided public meeting metadata.
