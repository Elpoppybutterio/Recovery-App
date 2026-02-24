export const Design = {
  // Base palette (matches the purple liquid-glass mock)
  color: {
    // Background gradient anchors
    bgTop: "#12082B",
    bgMid: "#2A0E5B",
    bgBottom: "#0B061A",

    // Accents
    neonPurple: "#A855F7",
    neonLavender: "#C4B5FD",
    neonMagenta: "#D946EF",
    neonCyan: "#22D3EE",

    // Text
    textPrimary: "rgba(255,255,255,0.96)",
    textSecondary: "rgba(255,255,255,0.78)",
    textTertiary: "rgba(255,255,255,0.60)",

    // Glass
    glassFill: "rgba(255,255,255,0.06)", // subtle milky fill
    glassFillStrong: "rgba(168,85,247,0.12)", // purple-tinted fill
    glassStroke: "rgba(255,255,255,0.16)", // hairline border
    glassStrokeStrong: "rgba(255,255,255,0.22)", // emphasized border
    glassInnerHighlight: "rgba(255,255,255,0.10)",

    // Chips
    chipFill: "rgba(255,255,255,0.10)",
    chipStroke: "rgba(255,255,255,0.18)",

    // Status
    okFill: "rgba(52,211,153,0.18)",
    okText: "rgba(52,211,153,0.95)",
  },

  radius: {
    card: 16,
    chip: 999,
    button: 16,
  },

  shadow: {
    // iOS shadows
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
    },
    // Android elevation
    android: { elevation: 10 },
  },

  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
  },
} as const;
