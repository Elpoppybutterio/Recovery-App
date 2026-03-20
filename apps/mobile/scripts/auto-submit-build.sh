#!/bin/zsh

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <build-id>" >&2
  exit 1
fi

BUILD_ID="$1"
APP_DIR="/Users/development/Documents/Recovery-app/Recovery-App/apps/mobile"

while true; do
  cd "$APP_DIR"
  STATUS="$(npx eas build:view "$BUILD_ID" --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const parsed=JSON.parse(s);process.stdout.write(parsed.status || '')});")"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) build=$BUILD_ID status=$STATUS"

  if [[ "$STATUS" == "finished" ]]; then
    EAS_NO_VCS=1 npx eas submit --platform ios --profile production --id "$BUILD_ID" --non-interactive
    exit $?
  fi

  if [[ "$STATUS" == "errored" || "$STATUS" == "canceled" ]]; then
    echo "build $BUILD_ID ended with terminal status $STATUS" >&2
    exit 1
  fi

  sleep 35
done
