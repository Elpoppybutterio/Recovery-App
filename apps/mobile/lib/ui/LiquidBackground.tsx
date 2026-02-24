import React from "react";
import { ImageBackground, StyleSheet } from "react-native";
import dashboardBg from "../../assets/dashboard-bg.png";

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
    <ImageBackground source={dashboardBg} resizeMode="cover" style={styles.root}>
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#12082B" },
});
