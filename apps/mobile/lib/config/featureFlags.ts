export const featureFlags = {
  chatEnabled: false,
} as const;

export type FeatureFlags = typeof featureFlags;
