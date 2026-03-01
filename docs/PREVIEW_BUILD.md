# Preview Build Pipeline (Internal Distribution -> TestFlight-ready)

This runbook defines how to produce a release-like preview build for testers while keeping development builds for daily coding.

## Profiles

`eas.json` includes:

- `development`: dev client (`APP_ENV=development`)
- `preview`: internal distribution (`APP_ENV=preview`)
- `preview_store`: store distribution for TestFlight submission path (`APP_ENV=preview`)
- `production`: App Store production (`APP_ENV=production`)

## App identifiers

- Development build: `com.sober.ai.dev`
- Preview build: `com.sober.ai` (same as production for store-like behavior)
- Production build: `com.sober.ai`

## Environment behavior

The app environment is controlled by `APP_ENV` in EAS profiles via `apps/mobile/app.config.ts`.
No hardcoded API base URL switching is required here.

## Build commands

From repo root:

```bash
pnpm dlx eas-cli build --profile preview --platform ios
```

Optional TestFlight-style store build:

```bash
pnpm dlx eas-cli build --profile preview_store --platform ios
```

Submit (store profile only):

```bash
pnpm dlx eas-cli submit --profile preview_store --platform ios
```

## Tester install flow (internal preview)

1. Build with `preview` profile.
2. Copy the EAS install URL from the build output.
3. Share the install URL with internal testers.
4. Testers install/update the preview build.

## Smoke test checklist (preview build)

- Launch + login/session restore works
- Dashboard loads
- Meetings list/logs load
- PDF export/print path works (if enabled)
- No startup crash
- Confirm preview environment:
  - app config contains `extra.appEnv = "preview"`

## Known limitations

- EAS build/submit requires EAS auth and network access.
- Internal preview installs are not TestFlight; use `preview_store` + submit for TestFlight path.

## Workspace fix for expo-updates prompt

If EAS prompts to install `expo-updates` and fails with:
`The expo package was not found`,
run installation/configuration from the mobile workspace context:

```bash
pnpm --filter @recovery/mobile exec expo install expo-updates
cd apps/mobile
pnpm dlx eas-cli update:configure --platform ios
cd ../..
```

## Daily developer workflow (unchanged)

Continue daily local work with development client:

```bash
pnpm --filter @recovery/mobile start:dev-client
```
