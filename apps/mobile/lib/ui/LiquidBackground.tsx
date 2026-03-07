import React from "react";
import { ImageBackground, StyleSheet, View } from "react-native";

type Props = {
  children: React.ReactNode;
};

/**
 * Full-screen dashboard background image.
 */
export function LiquidBackground({ children }: Props) {
  return (
    <View style={styles.root}>
      <ImageBackground
        source={require("../../assets/dashboard-bg.png")}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.dimOverlay} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#12082B" },
  dimOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(18, 8, 43, 0.28)" },
});
