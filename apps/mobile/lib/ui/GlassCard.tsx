import { BlurView } from "expo-blur";
import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { glass, radius, spacing } from "../theme/tokens";

type GlassCardProps = PropsWithChildren<{
  style?: ViewStyle;
}>;

export function GlassCard({ children, style }: GlassCardProps) {
  return (
    <View style={[styles.shadow, style]}>
      <BlurView intensity={glass.blurIntensity} tint="dark" style={styles.blur}>
        <View style={styles.highlight} />
        {children}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.xl,
    overflow: "hidden",
    shadowColor: glass.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  blur: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: glass.cardBorder,
    backgroundColor: glass.cardBg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  highlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: glass.cardHighlight,
    opacity: 0.45,
  },
});
