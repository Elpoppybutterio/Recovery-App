import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text as NativeText,
  View,
  type ViewStyle,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

type MilestoneCoinProps = {
  label: string;
  size?: number;
  caption?: string;
  autoSpin?: boolean;
  spinDurationMs?: number;
  showShadow?: boolean;
  style?: ViewStyle;
};

function formatFrontFaceLabel(label: string): string {
  if (/^\d+Y$/.test(label)) {
    return label.replace("Y", "");
  }
  return label;
}

function frontLabelFontSize(label: string, size: number): number {
  if (label.length >= 3) {
    return size * 0.165;
  }
  if (label.length === 2) {
    return size * 0.205;
  }
  return size * 0.26;
}

function CoinFace({
  size,
  label,
  caption,
  reverse = false,
}: {
  size: number;
  label: string;
  caption: string;
  reverse?: boolean;
}) {
  const rim = size / 2;
  const frontLabel = formatFrontFaceLabel(label);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <LinearGradient
          id={`coinRim${reverse ? "Back" : "Front"}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <Stop offset="0%" stopColor="#fff4c2" />
          <Stop offset="18%" stopColor="#f5d575" />
          <Stop offset="48%" stopColor="#b27b1d" />
          <Stop offset="82%" stopColor="#f8de8d" />
          <Stop offset="100%" stopColor="#8f5c12" />
        </LinearGradient>
        <LinearGradient
          id={`coinCore${reverse ? "Back" : "Front"}`}
          x1="10%"
          y1="12%"
          x2="86%"
          y2="90%"
        >
          <Stop offset="0%" stopColor="#5a2c96" />
          <Stop offset="45%" stopColor="#45166f" />
          <Stop offset="100%" stopColor="#2a0d44" />
        </LinearGradient>
        <LinearGradient
          id={`coinGlow${reverse ? "Back" : "Front"}`}
          x1="18%"
          y1="8%"
          x2="85%"
          y2="94%"
        >
          <Stop offset="0%" stopColor="rgba(255,255,255,0.68)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
        </LinearGradient>
      </Defs>

      <Circle
        cx={rim}
        cy={rim}
        r={rim * 0.98}
        fill={`url(#coinRim${reverse ? "Back" : "Front"})`}
      />
      <Circle cx={rim} cy={rim} r={rim * 0.9} fill="#f6e2a0" opacity={0.9} />
      <Circle
        cx={rim}
        cy={rim}
        r={rim * 0.84}
        fill={`url(#coinCore${reverse ? "Back" : "Front"})`}
      />
      <Ellipse
        cx={size * 0.36}
        cy={size * 0.24}
        rx={size * 0.22}
        ry={size * 0.11}
        fill={`url(#coinGlow${reverse ? "Back" : "Front"})`}
        opacity={0.26}
        transform={`rotate(-20 ${size * 0.38} ${size * 0.26})`}
      />
      <Circle
        cx={rim}
        cy={rim}
        r={rim * 0.78}
        fill="none"
        stroke="#e6c36b"
        strokeWidth={Math.max(2, size * 0.017)}
        opacity={0.9}
      />

      {!reverse ? (
        <>
          <Path
            d={`M ${size * 0.5} ${size * 0.24} L ${size * 0.69} ${size * 0.59} L ${size * 0.31} ${size * 0.59} Z`}
            fill="none"
            stroke="#f5db93"
            strokeWidth={Math.max(2.2, size * 0.02)}
            opacity={0.96}
            strokeLinejoin="round"
          />
          <SvgText
            x={rim}
            y={size * 0.19}
            fill="#f7e9b5"
            fontSize={size * 0.078}
            fontWeight="700"
            textAnchor="middle"
          >
            UNITY
          </SvgText>
          <SvgText
            x={rim}
            y={size * 0.515}
            fill="#fff7cf"
            fontSize={frontLabelFontSize(frontLabel, size)}
            fontWeight="900"
            textAnchor="middle"
          >
            {frontLabel}
          </SvgText>
          <SvgText
            x={rim}
            y={size * 0.71}
            fill="#f7e9b5"
            fontSize={size * 0.07}
            fontWeight="700"
            textAnchor="middle"
          >
            RECOVERY
          </SvgText>
        </>
      ) : (
        <>
          <G opacity={0.96}>
            <Path
              d={`M ${size * 0.5} ${size * 0.26} L ${size * 0.69} ${size * 0.61} L ${size * 0.31} ${size * 0.61} Z`}
              fill="none"
              stroke="#f5db93"
              strokeWidth={Math.max(2.2, size * 0.02)}
              strokeLinejoin="round"
            />
            <Line
              x1={size * 0.5}
              y1={size * 0.31}
              x2={size * 0.5}
              y2={size * 0.55}
              stroke="#f5db93"
              strokeWidth={Math.max(2, size * 0.014)}
            />
            <Line
              x1={size * 0.43}
              y1={size * 0.43}
              x2={size * 0.57}
              y2={size * 0.43}
              stroke="#f5db93"
              strokeWidth={Math.max(2, size * 0.014)}
            />
          </G>
          <SvgText
            x={rim}
            y={size * 0.69}
            fill="#f9ebbc"
            fontSize={size * 0.082}
            fontWeight="700"
            textAnchor="middle"
          >
            ONE DAY
          </SvgText>
          <SvgText
            x={rim}
            y={size * 0.77}
            fill="#f9ebbc"
            fontSize={size * 0.078}
            fontWeight="700"
            textAnchor="middle"
          >
            AT A TIME
          </SvgText>
          <Rect
            x={size * 0.24}
            y={size * 0.16}
            width={size * 0.52}
            height={size * 0.07}
            rx={size * 0.02}
            fill="rgba(255,255,255,0.08)"
          />
          <SvgText
            x={rim}
            y={size * 0.208}
            fill="#f5db93"
            fontSize={size * 0.054}
            fontWeight="700"
            textAnchor="middle"
          >
            KEEP COMING BACK
          </SvgText>
        </>
      )}

      <Rect
        x={size * 0.2}
        y={size * 0.82}
        width={size * 0.6}
        height={size * 0.08}
        rx={size * 0.024}
        fill="rgba(12, 5, 20, 0.42)"
      />
      <SvgText
        x={rim}
        y={size * 0.875}
        fill="#ffe9a1"
        fontSize={size * 0.058}
        fontWeight="800"
        letterSpacing={size * 0.008}
        textAnchor="middle"
      >
        {caption}
      </SvgText>
    </Svg>
  );
}

export function MilestoneCoin({
  label,
  size = 120,
  caption = "RECOVERY",
  autoSpin = false,
  spinDurationMs = 4600,
  showShadow = true,
  style,
}: MilestoneCoinProps) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!autoSpin) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: spinDurationMs,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      spin.stopAnimation();
      spin.setValue(0);
    };
  }, [autoSpin, spin, spinDurationMs]);

  const frontRotation = useMemo(
    () =>
      spin.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
      }),
    [spin],
  );
  const backRotation = useMemo(
    () =>
      spin.interpolate({
        inputRange: [0, 1],
        outputRange: ["180deg", "540deg"],
      }),
    [spin],
  );

  return (
    <View style={[styles.root, { width: size, height: size + size * 0.11 }, style]}>
      {showShadow ? (
        <View
          style={[
            styles.shadow,
            {
              width: size * 0.58,
              height: size * 0.075,
              borderRadius: size * 0.05,
              bottom: size * 0.018,
            },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.coinWrap,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <View
          style={[
            styles.coinMask,
            {
              borderRadius: size / 2,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.face,
              {
                transform: [{ perspective: size * 5.2 }, { rotateY: frontRotation }],
              },
            ]}
          >
            <CoinFace size={size} label={label} caption={caption} />
          </Animated.View>
          <Animated.View
            style={[
              styles.face,
              {
                transform: [{ perspective: size * 5.2 }, { rotateY: backRotation }],
              },
            ]}
          >
            <CoinFace size={size} label={label} caption={caption} reverse />
          </Animated.View>
        </View>
      </View>
      <NativeText style={[styles.accessibilityLabel, { fontSize: 0.1 }]}>{label}</NativeText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  coinWrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  coinMask: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    backfaceVisibility: "hidden",
  },
  shadow: {
    position: "absolute",
    backgroundColor: "rgba(12, 2, 30, 0.34)",
  },
  accessibilityLabel: {
    opacity: 0,
    position: "absolute",
  },
});
