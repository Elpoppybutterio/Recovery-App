# Development Build Workflow (Expo SDK 54)

This repo now supports a production-aligned Expo Development Build workflow while keeping Expo Go as a temporary fallback.

## Profiles

`eas.json` includes:

- `development`: dev client, internal distribution, `APP_ENV=development`
- `preview`: internal distribution, `APP_ENV=preview`
- `production`: store distribution, `APP_ENV=production`

## App identifiers

Identifiers are environment-aware via `apps/mobile/app.config.ts`:

- Development: `com.sober.ai.dev`
- Preview: `com.sober.ai`
- Production: `com.sober.ai`

The shared deep-link scheme is `soberai`.

## Daily local development

From repo root:

```bash
pnpm --filter @recovery/mobile start:dev-client
```

This starts Metro for a development build using tunnel mode.

Expo Go fallback (temporary during migration):

```bash
pnpm --filter @recovery/mobile start:go
```

## Build and install (iOS + Android)

From repo root:

```bash
pnpm dlx eas-cli build --profile development --platform ios
pnpm dlx eas-cli build --profile development --platform android
```

Equivalent workspace scripts:

```bash
pnpm mobile:build:dev:ios
pnpm mobile:build:dev:android
```

After build completion, share the install URL from EAS with testers.

### Native permission changes require reinstall

If you change iOS location keys in `app.config.ts` / `app.json` (`NSLocation*UsageDescription`,
`UIBackgroundModes`), you must rebuild and reinstall the iOS dev client. OTA reloads do not apply
Info.plist changes.

Recommended sequence:

```bash
pnpm mobile:build:dev:ios
```

Then install the new build from EAS, remove the prior dev client if needed, and launch again.

For release-like preview/tester distribution, use:

- [`docs/PREVIEW_BUILD.md`](./PREVIEW_BUILD.md)

## Smoke test checklist (dev build)

- App launches from installed dev build
- Session/auth flow works
- Dashboard renders without crash
- Meetings list and logs load
- PDF export path is reachable
- Navigation between tabs/screens works
- No startup crash in simulator/device

## Troubleshooting

- If Metro cannot connect:
  - ensure tunnel mode is used (`start:dev-client`)
  - restart Metro with `-c` cache clear if needed
- If config seems wrong, verify `APP_ENV` in the build profile
- Use `pnpm` only; do not run `npm install` to avoid lockfile drift
