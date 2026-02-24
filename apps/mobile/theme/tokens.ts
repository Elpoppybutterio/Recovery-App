export const routineTheme = {
  colors: {
    bgTop: "#1A1033",
    bgBottom: "#090712",
    accent1: "#7C3AED",
    accent2: "#A855F7",
    accentGlow: "rgba(168,85,247,0.55)",
    textPrimary: "#F5F3FF",
    textSecondary: "rgba(245,243,255,0.72)",
    cardFill: "rgba(255,255,255,0.10)",
    cardStroke: "rgba(255,255,255,0.18)",
  },
  radii: {
    card: 22,
    pill: 999,
  },
  blur: 12,
  shadows: {
    glow: {
      shadowColor: "#A855F7",
      shadowOpacity: 0.26,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
  },
} as const;
