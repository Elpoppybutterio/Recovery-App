import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { CrudListEditor } from "../components/CrudListEditor";
import { LiquidGlassCard } from "../components/LiquidGlassCard";
import type { NightlyInventoryDayState } from "../lib/routines/types";
import { routineTheme } from "../theme/tokens";

type NightlyFearCategory = keyof Pick<
  NightlyInventoryDayState,
  "resentful" | "selfSeeking" | "selfish" | "dishonest"
>;

function asEditorItems(items: Array<{ id: string; text: string }>) {
  return items;
}

const COMMON_ALCOHOLIC_FEARS = [
  "Fear of people",
  "Fear of rejection",
  "Fear of abandonment",
  "Fear of not being enough",
  "Fear of failure",
  "Fear of success",
  "Fear of financial insecurity",
  "Fear of losing what I have",
  "Fear of not getting what I want",
  "Fear of being alone",
  "Fear of intimacy",
  "Fear of conflict",
  "Fear of authority",
  "Fear of judgment",
  "Fear of uncertainty",
] as const;

export function NightlyInventoryScreen({
  dayState,
  dateLabel,
  onBack,
  onAddEntry,
  onUpdateEntry,
  onRemoveEntry,
  onUpdateEntryFear,
  onSetNotes,
  onToggleEleventhStepPrayerEnabled,
  onListenEleventhStepPrayer,
  onReadEleventhStepPrayer,
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
      "resentful" | "selfSeeking" | "selfish" | "dishonest" | "apology"
    >,
  ) => void;
  onUpdateEntry: (
    category: keyof Pick<
      NightlyInventoryDayState,
      "resentful" | "selfSeeking" | "selfish" | "dishonest" | "apology"
    >,
    id: string,
    value: string,
  ) => void;
  onRemoveEntry: (
    category: keyof Pick<
      NightlyInventoryDayState,
      "resentful" | "selfSeeking" | "selfish" | "dishonest" | "apology"
    >,
    id: string,
  ) => void;
  onUpdateEntryFear: (category: NightlyFearCategory, id: string, fear: string | null) => void;
  onSetNotes: (value: string) => void;
  onToggleEleventhStepPrayerEnabled: () => void;
  onListenEleventhStepPrayer: () => void;
  onReadEleventhStepPrayer: () => void;
  onToggleCompleted: () => void;
  onTextSponsor: () => void;
  onExportPdf: () => void;
}) {
  const [openFearForEntryId, setOpenFearForEntryId] = useState<string | null>(null);
  const [customFearDraftByEntryId, setCustomFearDraftByEntryId] = useState<Record<string, string>>(
    {},
  );
  const renderFearSection = (category: NightlyFearCategory, title: string, placeholder: string) => {
    const entries = dayState[category];
    return (
      <View>
        <View style={styles.editorHeader}>
          <Text style={styles.promptTitle}>{title}</Text>
          <Pressable style={styles.addBtn} onPress={() => onAddEntry(category)}>
            <Text style={styles.addText}>+ Add</Text>
          </Pressable>
        </View>
        {entries.map((entry) => (
          <View key={entry.id} style={styles.rowWrap}>
            <TextInput
              style={styles.input}
              value={entry.text}
              onChangeText={(value) => onUpdateEntry(category, entry.id, value)}
              placeholder={placeholder}
              placeholderTextColor="rgba(245,243,255,0.45)"
              multiline
            />
            <Pressable
              style={styles.fearDropdownTrigger}
              onPress={() =>
                setOpenFearForEntryId((current) => (current === entry.id ? null : entry.id))
              }
            >
              <Text style={styles.fearDropdownTriggerText}>
                {entry.fear && entry.fear.length > 0 ? entry.fear : "What fear caused the action?"}
              </Text>
              <Text style={styles.fearDropdownChevron}>
                {openFearForEntryId === entry.id ? "▲" : "▼"}
              </Text>
            </Pressable>
            {openFearForEntryId === entry.id ? (
              <View style={styles.fearDropdownMenu}>
                <Pressable
                  style={styles.fearDropdownOption}
                  onPress={() => {
                    onUpdateEntryFear(category, entry.id, null);
                    setOpenFearForEntryId(null);
                  }}
                >
                  <Text style={styles.fearDropdownOptionText}>None selected</Text>
                </Pressable>
                {COMMON_ALCOHOLIC_FEARS.map((fear) => (
                  <Pressable
                    key={`${entry.id}-${fear}`}
                    style={styles.fearDropdownOption}
                    onPress={() => {
                      onUpdateEntryFear(category, entry.id, fear);
                      setOpenFearForEntryId(null);
                    }}
                  >
                    <Text style={styles.fearDropdownOptionText}>{fear}</Text>
                    {entry.fear === fear ? (
                      <Text style={styles.fearDropdownOptionCheck}>✓</Text>
                    ) : null}
                  </Pressable>
                ))}
                <View style={styles.customFearRow}>
                  <TextInput
                    style={styles.customFearInput}
                    value={customFearDraftByEntryId[entry.id] ?? ""}
                    onChangeText={(value) =>
                      setCustomFearDraftByEntryId((current) => ({
                        ...current,
                        [entry.id]: value,
                      }))
                    }
                    placeholder="Add custom fear..."
                    placeholderTextColor="rgba(245,243,255,0.45)"
                  />
                  <Pressable
                    style={styles.customFearAddBtn}
                    onPress={() => {
                      const draft = (customFearDraftByEntryId[entry.id] ?? "").trim();
                      if (!draft) {
                        return;
                      }
                      onUpdateEntryFear(category, entry.id, draft);
                      setCustomFearDraftByEntryId((current) => ({
                        ...current,
                        [entry.id]: "",
                      }));
                      setOpenFearForEntryId(null);
                    }}
                  >
                    <Text style={styles.customFearAddText}>Add</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            <Pressable style={styles.removeBtn} onPress={() => onRemoveEntry(category, entry.id)}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))}
        {entries.length === 0 ? <Text style={styles.empty}>No items yet.</Text> : null}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <LiquidGlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Nightly Routine</Text>
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
        {renderFearSection("resentful", "Resentful (Who/What + Note)", "Who/what + note...")}
        {renderFearSection("selfSeeking", "Self-seeking", "Entry...")}
        {renderFearSection("selfish", "Selfish", "Entry...")}
        {renderFearSection("dishonest", "Dishonest", "Entry...")}
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
        <View style={styles.switchRow}>
          <Text style={styles.promptTitle}>11th Step Prayer</Text>
          <Switch
            value={dayState.eleventhStepPrayerEnabled}
            onValueChange={onToggleEleventhStepPrayerEnabled}
            ios_backgroundColor="rgba(148,163,184,0.45)"
            trackColor={{ false: "rgba(148,163,184,0.45)", true: "rgba(52,199,89,0.65)" }}
          />
        </View>
        <View style={styles.buttonRow}>
          <Pressable
            style={[
              styles.secondaryBtn,
              !dayState.eleventhStepPrayerEnabled ? styles.disabledActionBtn : null,
            ]}
            onPress={onListenEleventhStepPrayer}
            disabled={!dayState.eleventhStepPrayerEnabled}
          >
            <Text style={styles.secondaryText}>Listen</Text>
          </Pressable>
          <Pressable
            style={[
              styles.primaryBtn,
              !dayState.eleventhStepPrayerEnabled ? styles.disabledActionBtn : null,
            ]}
            onPress={onReadEleventhStepPrayer}
            disabled={!dayState.eleventhStepPrayerEnabled}
          >
            <Text style={styles.primaryText}>Read</Text>
          </Pressable>
        </View>
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
              {dayState.completedAt ? "Mark Incomplete" : "Mark Nightly Routine Complete"}
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
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
  editorHeader: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: routineTheme.radii.pill,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  addText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  rowWrap: {
    gap: 8,
    marginTop: 8,
  },
  fearDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  fearDropdownTriggerText: {
    flex: 1,
    color: routineTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  fearDropdownChevron: {
    color: routineTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  fearDropdownMenu: {
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.88)",
    overflow: "hidden",
  },
  fearDropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  fearDropdownOptionText: {
    flex: 1,
    color: routineTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  fearDropdownOptionCheck: {
    color: "#bbf7d0",
    fontSize: 13,
    fontWeight: "800",
  },
  customFearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  customFearInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: routineTheme.colors.textPrimary,
    fontSize: 13,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  customFearAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: routineTheme.radii.pill,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(124,58,237,0.4)",
  },
  customFearAddText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  removeBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: routineTheme.radii.pill,
    backgroundColor: "rgba(239,68,68,0.18)",
  },
  removeText: {
    color: "#fecaca",
    fontSize: 11,
    fontWeight: "700",
  },
  empty: {
    color: routineTheme.colors.textSecondary,
    fontSize: 12,
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
  disabledActionBtn: {
    opacity: 0.5,
  },
});
