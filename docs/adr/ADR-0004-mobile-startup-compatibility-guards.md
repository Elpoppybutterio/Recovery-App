# ADR-0004: Mobile Startup Compatibility Guards

## Status

Accepted - March 6, 2026

## Context

Recent mobile startup failures presented as a white screen followed by app termination shortly after launch. Two recurring risk sources were identified:

1. JS updates can reference optional native modules (`react-native-maps`, `expo-calendar`, `expo-notifications`) that are not present or not link-compatible in the installed binary.
2. New Architecture enablement can increase startup instability on some build/runtime combinations in this app stack.

These failures block core accountability workflows and reduce pilot reliability.

## Decision

1. Load optional native modules defensively at runtime and provide graceful no-op fallbacks when unavailable.
2. Degrade UI/actions safely when modules are unavailable (for example, map mode unavailable message rather than crash).
3. Default `EXPO_NEW_ARCH_ENABLED` to `false` unless explicitly enabled.
4. Set EAS profiles to pass `EXPO_NEW_ARCH_ENABLED=false` for development/preview/production consistency.

## Consequences

- App launch is resilient to missing optional native modules and stale binaries.
- Feature-specific behavior may be unavailable until the correct build is installed, but startup remains functional.
- New builds prioritize launch stability over New Architecture adoption speed.
