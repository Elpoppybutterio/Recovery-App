import { Design } from "../ui/design";

export const colors = {
  bgTop: Design.color.bgTop,
  bgMid: Design.color.bgMid,
  bgBottom: Design.color.bgBottom,

  purple50: "#F6F1FF",
  purple100: "#E9DDFF",
  purple200: "#D1B8FF",
  purple300: "#B58AFF",
  purple400: Design.color.neonPurple,
  purple500: Design.color.neonPurple,
  purple600: "#9333EA",
  purple700: "#7E22CE",

  neonLavender: Design.color.neonLavender,
  neonPink: Design.color.neonMagenta,
  neonCyan: Design.color.neonCyan,

  textPrimary: Design.color.textPrimary,
  textSecondary: Design.color.textSecondary,
  textMuted: Design.color.textTertiary,

  danger: "#FB7185",
  success: Design.color.okText,
};

export const glass = {
  cardBg: Design.color.glassFill,
  cardBorder: Design.color.glassStroke,
  cardHighlight: Design.color.glassInnerHighlight,
  shadow: "#000000",
  blurIntensity: 22,
};

export const radius = {
  sm: 12,
  md: 16,
  lg: Design.radius.card,
  xl: Design.radius.card,
  pill: Design.radius.chip,
};

export const spacing = {
  xs: Design.spacing.xs,
  sm: Design.spacing.sm,
  md: Design.spacing.md,
  lg: Design.spacing.lg,
  xl: Design.spacing.xl,
  xxl: 32,
};

export const typography = {
  h1: 40,
  h2: 22,
  h3: 16,
  body: 14,
  small: 12,
  tiny: 11,

  weightBold: "700" as const,
  weightSemi: "600" as const,
  weightMed: "500" as const,
};
