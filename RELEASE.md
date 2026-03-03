# Release Playbook

## EAS Profiles

- Dev client: `development` (development client, internal distribution).
- Internal QA install: `preview` (internal distribution).
- TestFlight RC: `preview_store` (store distribution on `preview` channel).
- App Store submission: `production` (store distribution on `production` channel).

## One Flow (Branch to Store)

1. Create release branch (`release/vX.Y.Z` or `release/vX.Y.Z-rc`).
2. Implement changes in child branches.
3. Push child branches and open PRs targeting the release branch.
4. Squash merge each child PR into the release branch.
5. Run `npm run release:audit` from repo root and fix any failures.
6. Build RC for TestFlight:
   - `cd apps/mobile`
   - `eas build --platform ios --profile preview_store`
7. Validate TestFlight build with smoke checklist below.
8. Merge release branch into `main` with squash.
9. Tag release:
   - `git checkout main && git pull`
   - `git tag vX.Y.Z`
   - `git push origin vX.Y.Z`
10. Build and submit production:
    - `cd apps/mobile`
    - `eas build --platform ios --profile production`
    - `eas submit --platform ios --profile production`

## Smoke Checklist (Required)

- Meetings list:
  - In-progress meetings show `Details` and a single `Attend` button.
  - `Details` opens details screen.
  - `Attend` starts attendance flow.
- Attendance export:
  - Select 1 meeting and export PDF successfully.
  - Select 10 meetings and export PDF successfully.
  - Select 50 meetings and export PDF successfully.
  - Verify no crash with mixed signed/unsigned records.
- Location permissions:
  - Accept `While Using` permission and verify location features work.
  - Validate optional `Always` permission flow and fallback behavior if denied.
- API resilience:
  - No recurring HTTP 500s during key flows.
  - If API returns errors, UI shows graceful status/error messaging.

## Notes

- `development`, `preview`, and `production` all define `EXPO_PUBLIC_API_URL` to avoid environment drift.
- Treat `preview_store` as TestFlight-only and `production` as App Store-only.
