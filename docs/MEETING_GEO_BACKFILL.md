# Meeting Geo Backfill Runbook

Use this job to backfill missing/invalid meeting coordinates for AOI/Meeting Guide records.

## Run

```bash
pnpm --filter @recovery/api meetings:geo:backfill -- --tenantId tenant-a
```

## Common Options

- `--tenantId <id>`: target tenant (falls back to `MEETING_GUIDE_DEFAULT_TENANT_ID`)
- `--batchSize <n>`: rows per query batch (default `100`)
- `--rateLimitMs <n>`: delay between provider requests (default `1100`)
- `--maxRows <n>`: max rows scanned in a run (default `5000`)
- `--staleDays <n>`: re-check geo rows older than this (default `30`)
- `--dryRun`: compute results without writing updates

## Notes

- The job is idempotent: reruns keep existing `geo_status='ok'` rows stable unless stale.
- Geocode calls are cached by normalized address within each run.
- Completion logs include:
  - `geocode_attempts_total`
  - `geocode_success_total`
  - `geocode_failed_total`
