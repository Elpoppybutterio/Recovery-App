import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  children: React.ReactNode;
};

/**
 * Purple "liquid glass" background:
 * - deep multi-stop gradient
 * - large soft blobs (top-right, bottom-left, mid-right)
 * - subtle top wave highlight
 */
export function LiquidBackground({ children }: Props) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#160A35", "#21104A", "#2A1359"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.overlayTopRight} />
      <View style={styles.overlayBottomLeft} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#12082B" },
  overlayTopRight: {
    position: "absolute",
    right: -60,
    top: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(143, 105, 255, 0.20)",
  },
  overlayBottomLeft: {
    position: "absolute",
    left: -80,
    bottom: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(88, 214, 255, 0.14)",
  },
});
