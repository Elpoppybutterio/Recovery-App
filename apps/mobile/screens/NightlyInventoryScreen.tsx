import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CrudListEditor } from "../components/CrudListEditor";
import { LiquidGlassCard } from "../components/LiquidGlassCard";
import type { NightlyInventoryDayState } from "../lib/routines/types";
import { routineTheme } from "../theme/tokens";

function asEditorItems(items: Array<{ id: string; text: string }>) {
  return items;
}

export function NightlyInventoryScreen({
  dayState,
  dateLabel,
  onBack,
  onAddEntry,
  onUpdateEntry,
  onRemoveEntry,
  onSetNotes,
  onToggleCompleted,
  onTextSponsor,
  onExportPdf,
}: {
  dayState: NightlyInventoryDayState;
  dateLabel: string;
  onBack: () => void;
  onAddEntry: (
    category: keyof Pick<
      NightlyInventoryDayState,
      "resentful" | "selfish" | "dishonest" | "afraid" | "apology"
    >,
  ) => void;
  onUpdateEntry: (
    category: keyof Pick<
      NightlyInventoryDayState,
      "resentful" | "selfish" | "dishonest" | "afraid" | "apology"
    >,
    id: string,
    value: string,
  ) => void;
  onRemoveEntry: (
    category: keyof Pick<
      NightlyInventoryDayState,
      "resentful" | "selfish" | "dishonest" | "afraid" | "apology"
    >,
    id: string,
  ) => void;
  onSetNotes: (value: string) => void;
  onToggleCompleted: () => void;
  onTextSponsor: () => void;
  onExportPdf: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <LiquidGlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Nightly Inventory</Text>
          <Pressable style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
        <Text style={styles.meta}>{dateLabel}</Text>
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.promptTitle}>Step 10 Prompt</Text>
        <Text style={styles.promptText}>{dayState.prompt}</Text>
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <CrudListEditor
          title="Resentful (Who/What + Note)"
          items={asEditorItems(dayState.resentful)}
          onAdd={() => onAddEntry("resentful")}
          onChange={(id, value) => onUpdateEntry("resentful", id, value)}
          onRemove={(id) => onRemoveEntry("resentful", id)}
          placeholder="Example: coworker - short note"
        />
        <CrudListEditor
          title="Selfish"
          items={asEditorItems(dayState.selfish)}
          onAdd={() => onAddEntry("selfish")}
          onChange={(id, value) => onUpdateEntry("selfish", id, value)}
          onRemove={(id) => onRemoveEntry("selfish", id)}
          placeholder="Entry..."
        />
        <CrudListEditor
          title="Dishonest"
          items={asEditorItems(dayState.dishonest)}
          onAdd={() => onAddEntry("dishonest")}
          onChange={(id, value) => onUpdateEntry("dishonest", id, value)}
          onRemove={(id) => onRemoveEntry("dishonest", id)}
          placeholder="Entry..."
        />
        <CrudListEditor
          title="Afraid"
          items={asEditorItems(dayState.afraid)}
          onAdd={() => onAddEntry("afraid")}
          onChange={(id, value) => onUpdateEntry("afraid", id, value)}
          onRemove={(id) => onRemoveEntry("afraid", id)}
          placeholder="Entry..."
        />
        <CrudListEditor
          title="Owe An Apology?"
          items={asEditorItems(dayState.apology)}
          onAdd={() => onAddEntry("apology")}
          onChange={(id, value) => onUpdateEntry("apology", id, value)}
          onRemove={(id) => onRemoveEntry("apology", id)}
          placeholder="Who + message draft..."
        />
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.promptTitle}>Notes</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={dayState.notes}
          onChangeText={onSetNotes}
          placeholder="Add nightly review notes..."
          placeholderTextColor="rgba(245,243,255,0.45)"
          multiline
        />
        <View style={styles.buttonRow}>
          <Pressable style={styles.primaryBtn} onPress={onToggleCompleted}>
            <Text style={styles.primaryText}>
              {dayState.completedAt ? "Mark Incomplete" : "Mark Nightly Complete"}
            </Text>
          </Pressable>
        </View>
        <View style={styles.buttonRow}>
          <Pressable style={styles.primaryBtn} onPress={onTextSponsor}>
            <Text style={styles.primaryText}>Text To Sponsor</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onExportPdf}>
            <Text style={styles.secondaryText}>Export Nightly PDF</Text>
          </Pressable>
        </View>
      </LiquidGlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    paddingBottom: 16,
  },
  card: {
    padding: 14,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: routineTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  meta: {
    color: routineTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  promptTitle: {
    color: routineTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  promptText: {
    color: routineTheme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: routineTheme.colors.textPrimary,
    fontSize: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: routineTheme.radii.pill,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  backText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: routineTheme.radii.pill,
    backgroundColor: "rgba(124,58,237,0.4)",
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
  },
  primaryText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: routineTheme.radii.pill,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  secondaryText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
});
