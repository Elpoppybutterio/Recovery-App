# Big Book Reader Validation Runbook

## Local validation

```bash
pnpm --filter @recovery/api test
pnpm --filter @recovery/api build
pnpm --filter @recovery/mobile typecheck
pnpm --filter @recovery/mobile test
```

## Render endpoint validation

Endpoint requires auth header in current API mode.

```bash
curl -i "https://sober-ai-api.onrender.com/v1/literature/bigbook/pages?start=60&end=63" \
  -H "Authorization: Bearer DEV_enduser-a1"
```

Expected after deploy:

- `HTTP 200`
- `edition`
- `updatedAt`
- `copyrightNotice`
- `range.start=60`, `range.end=63`
- `pages.length=4`
- pages in ascending order 60,61,62,63

## Mobile device validation (Expo tunnel)

```bash
cd apps/mobile
npx expo start -c --tunnel
```

Check on iPhone:

1. Open Morning Routine.
2. Tap `Big Book pp. 60-63` `Read`.
3. Confirm initial open starts at page 60 if no saved page.
4. Navigate to page 63, leave screen, re-open, confirm resume to last page.
5. Tap `Jump to 60` and confirm reset.
6. Enable airplane mode after first load, reopen screen, confirm cached pages load.

## Licensed content note

Replace placeholders in:
`apps/api/src/literature/bigbook/edition-aaws-4/pages-60-63.json`

Required shape:

- `edition`
- `updatedAt` (ISO timestamp)
- `copyrightNotice`
- `pages: [{ page, html }]`

Use exact AAWS-licensed page HTML for pages 60-63 only.
