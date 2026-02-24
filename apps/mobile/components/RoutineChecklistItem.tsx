import { Pressable, StyleSheet, Text, View } from "react-native";
import { routineTheme } from "../theme/tokens";

export function RoutineChecklistItem({
  title,
  detail,
  checked,
  onToggle,
  onListen,
  onRecord,
  onPlay,
  onOpenReader,
}: {
  title: string;
  detail?: string;
  checked: boolean;
  onToggle: () => void;
  onListen?: () => void;
  onRecord?: () => void;
  onPlay?: () => void;
  onOpenReader?: () => void;
}) {
  return (
    <View style={styles.item}>
      <Pressable style={styles.row} onPress={onToggle}>
        <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]}>
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </View>
      </Pressable>
      <View style={styles.actions}>
        {onListen ? (
          <Pressable style={styles.actionBtn} onPress={onListen}>
            <Text style={styles.actionText}>Listen</Text>
          </Pressable>
        ) : null}
        {onRecord ? (
          <Pressable style={styles.actionBtn} onPress={onRecord}>
            <Text style={styles.actionText}>Record</Text>
          </Pressable>
        ) : null}
        {onPlay ? (
          <Pressable style={styles.actionBtn} onPress={onPlay}>
            <Text style={styles.actionText}>Play</Text>
          </Pressable>
        ) : null}
        {onOpenReader ? (
          <Pressable style={styles.actionBtn} onPress={onOpenReader}>
            <Text style={styles.actionText}>Read</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: routineTheme.colors.accent2,
    borderColor: routineTheme.colors.accent2,
  },
  checkmark: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: routineTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  detail: {
    color: routineTheme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingLeft: 32,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: routineTheme.radii.pill,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  actionText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
});
