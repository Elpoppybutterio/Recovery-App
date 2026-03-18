import { StyleSheet, Text, View } from "react-native";

type MilestoneCoinProps = {
  label: string;
  size?: number;
  caption?: string;
};

export function MilestoneCoin({ label, size = 120, caption = "RECOVERY" }: MilestoneCoinProps) {
  const outerSize = size;
  const innerSize = Math.round(size * 0.78);
  const coreSize = Math.round(size * 0.58);

  return (
    <View
      style={[
        styles.outer,
        {
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
        },
      ]}
    >
      <View
        style={[
          styles.middle,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
          },
        ]}
      >
        <View
          style={[
            styles.core,
            {
              width: coreSize,
              height: coreSize,
              borderRadius: coreSize / 2,
            },
          ]}
        >
          <Text style={[styles.caption, { fontSize: Math.max(10, Math.round(size * 0.08)) }]}>
            {caption}
          </Text>
          <Text style={[styles.label, { fontSize: Math.max(20, Math.round(size * 0.22)) }]}>
            {label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(157, 250, 255, 0.72)",
    backgroundColor: "rgba(18, 126, 196, 0.92)",
    shadowColor: "#69f0ff",
    shadowOpacity: 0.36,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  middle: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(220, 255, 255, 0.84)",
    backgroundColor: "rgba(104, 224, 233, 0.82)",
  },
  core: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(237, 252, 255, 0.95)",
    gap: 2,
  },
  caption: {
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "rgba(10, 83, 124, 0.78)",
  },
  label: {
    fontWeight: "900",
    letterSpacing: 0.4,
    color: "#0b1839",
  },
});
