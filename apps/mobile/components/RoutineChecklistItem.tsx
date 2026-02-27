import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { routineTheme } from "../theme/tokens";

export function RoutineChecklistItem({
  title,
  detail,
  enabled,
  checked,
  onToggle,
  onToggleEnabled,
  customActionLabel,
  onCustomAction,
  onListen,
  onPlay,
  onOpenReader,
}: {
  title: string;
  detail?: string;
  enabled: boolean;
  checked: boolean;
  onToggle: () => void;
  onToggleEnabled: () => void;
  customActionLabel?: string;
  onCustomAction?: () => void;
  onListen?: () => void;
  onPlay?: () => void;
  onOpenReader?: () => void;
}) {
  return (
    <View style={styles.item}>
      <View style={[styles.row, !enabled ? styles.rowDisabled : null]}>
        <Pressable style={styles.rowPressTarget} onPress={enabled ? onToggle : undefined}>
          <View style={styles.textWrap}>
            <Text style={[styles.title, !enabled ? styles.titleDisabled : null]}>{title}</Text>
            {detail ? (
              <Text style={[styles.detail, !enabled ? styles.detailDisabled : null]}>{detail}</Text>
            ) : null}
            <Text style={[styles.completionState, checked ? styles.completionStateDone : null]}>
              {checked ? "Completed" : "Not completed"}
            </Text>
          </View>
        </Pressable>
        <Switch
          value={enabled}
          onValueChange={onToggleEnabled}
          ios_backgroundColor="rgba(148,163,184,0.45)"
          trackColor={{ false: "rgba(148,163,184,0.45)", true: "rgba(52,199,89,0.65)" }}
        />
      </View>
      {enabled && (onCustomAction || onListen || onPlay || onOpenReader) ? (
        <View style={styles.actions}>
          {onCustomAction ? (
            <Pressable style={styles.actionBtn} onPress={onCustomAction}>
              <Text style={styles.actionText}>{customActionLabel ?? "Action"}</Text>
            </Pressable>
          ) : null}
          {onListen ? (
            <Pressable style={styles.actionBtn} onPress={onListen}>
              <Text style={styles.actionText}>Listen</Text>
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
      ) : null}
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
  rowPressTarget: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  rowDisabled: {
    opacity: 0.65,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: routineTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  titleDisabled: {
    color: routineTheme.colors.textSecondary,
  },
  detail: {
    color: routineTheme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  detailDisabled: {
    opacity: 0.8,
  },
  completionState: {
    marginTop: 4,
    color: routineTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  completionStateDone: {
    color: "#bbf7d0",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
