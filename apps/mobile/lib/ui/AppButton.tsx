import { Pressable, StyleSheet, Text, View } from "react-native";
import { Design } from "./design";

type AppButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
};

export function AppButton({
  title,
  onPress,
  disabled = false,
  variant = "primary",
}: AppButtonProps) {
  if (variant === "primary") {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.button, styles.primaryButton, disabled ? styles.disabled : undefined]}
      >
        <View>
          <Text style={styles.primaryText}>{title}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        variant === "danger" ? styles.dangerButton : styles.secondaryButton,
        disabled ? styles.disabled : undefined,
      ]}
    >
      <View>
        <Text style={variant === "danger" ? styles.dangerText : styles.secondaryText}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Design.radius.chip,
    paddingHorizontal: Design.spacing.md,
    paddingVertical: Design.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  primaryButton: {
    borderWidth: 1,
    borderColor: Design.color.neonLavender,
    backgroundColor: Design.color.neonPurple,
  },
  dangerButton: {
    borderWidth: 1,
    borderColor: "#FB7185",
    backgroundColor: "rgba(251,113,133,0.18)",
  },
  primaryText: {
    color: Design.color.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryText: {
    color: Design.color.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  dangerText: {
    color: "#ffe4ea",
    fontSize: 14,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
});
