import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Design } from "./design";

export function GlassCard({
  children,
  style,
  strong = false,
  blurIntensity = 11,
  darken = false,
  gradientDark = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  strong?: boolean;
  blurIntensity?: number;
  darken?: boolean;
  gradientDark?: boolean;
}) {
  const fill = strong ? Design.color.glassFillStrong : Design.color.glassFill;
  const _blurIntensity = blurIntensity;
  void _blurIntensity;

  return (
    <View style={[styles.cardBase, { backgroundColor: fill }, style]}>
      {gradientDark ? <View pointerEvents="none" style={styles.gradientTopOverlay} /> : null}
      {gradientDark ? <View pointerEvents="none" style={styles.gradientBottomOverlay} /> : null}
      {darken ? <View pointerEvents="none" style={styles.darkenOverlay} /> : null}
      <View style={styles.innerHighlight} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cardBase: {
    borderRadius: Design.radius.card,
    borderWidth: 1,
    borderColor: Design.color.glassStroke,
    overflow: "hidden",
  },
  innerHighlight: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: Design.color.glassInnerHighlight,
  },
  darkenOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(18, 12, 47, 0.21)",
  },
  gradientTopOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "56%",
    backgroundColor: "rgba(40,18,95,0.15)",
  },
  gradientBottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "2%",
    backgroundColor: "rgba(8, 5, 24, 0.35)",
  },
});
