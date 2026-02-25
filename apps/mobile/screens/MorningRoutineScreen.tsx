import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CrudListEditor } from "../components/CrudListEditor";
import { LiquidGlassCard } from "../components/LiquidGlassCard";
import { RoutineChecklistItem } from "../components/RoutineChecklistItem";
import type {
  MeditationLink,
  MorningRoutineDayState,
  MorningRoutineTemplate,
} from "../lib/routines/types";
import { routineTheme } from "../theme/tokens";

export function MorningRoutineScreen({
  template,
  dayState,
  dateLabel,
  onBack,
  onToggleItem,
  onToggleItemEnabled,
  onSetSponsorSuggestions,
  onSetDailyReflectionsLink,
  onSetDailyReflectionsText,
  onSetNotes,
  onSetItemDetail,
  onToggleGotOnKnees,
  onOpenReader,
  onReadDailyReflections,
  onListenDailyReflections,
  onListenText,
  onPlayItem,
  onAddCustomPrayer,
  onUpdateCustomPrayer,
  onRemoveCustomPrayer,
  onAddMeditationLink,
  onUpdateMeditationLink,
  onRemoveMeditationLink,
  onExportPdf,
}: {
  template: MorningRoutineTemplate;
  dayState: MorningRoutineDayState;
  dateLabel: string;
  onBack: () => void;
  onToggleItem: (itemId: string) => void;
  onToggleItemEnabled: (itemId: string) => void;
  onSetSponsorSuggestions: (value: string) => void;
  onSetDailyReflectionsLink: (value: string) => void;
  onSetDailyReflectionsText: (value: string) => void;
  onSetNotes: (value: string) => void;
  onSetItemDetail: (itemId: string, detail: string) => void;
  onToggleGotOnKnees: () => void;
  onOpenReader: (title: string, url: string | null) => void;
  onReadDailyReflections: () => void;
  onListenDailyReflections: () => void;
  onListenText: (text: string) => void;
  onPlayItem: (itemId: string) => void;
  onAddCustomPrayer: () => void;
  onUpdateCustomPrayer: (id: string, value: string) => void;
  onRemoveCustomPrayer: (id: string) => void;
  onAddMeditationLink: () => void;
  onUpdateMeditationLink: (id: string, link: MeditationLink) => void;
  onRemoveMeditationLink: (id: string) => void;
  onExportPdf: () => void;
}) {
  const prayerItems = template.customPrayers.map((item) => ({ id: item.id, text: item.text }));

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <LiquidGlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Morning Routine</Text>
          <Pressable style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
        <Text style={styles.meta}>{dateLabel}</Text>
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Checklist</Text>
        {template.items.map((item) => {
          const isDailyReflections = item.id === "daily-reflections";
          const isSponsorCheckIn = item.id === "sponsor-check-in";
          const isAdditionalSuggestions = item.id === "additional-suggestions";
          return (
            <View key={item.id}>
              <RoutineChecklistItem
                title={item.title}
                detail={item.detail}
                enabled={item.enabled}
                checked={Boolean(dayState.completedByItemId[item.id])}
                onToggle={() => onToggleItem(item.id)}
                onToggleEnabled={() => onToggleItemEnabled(item.id)}
                onListen={
                  isDailyReflections
                    ? onListenDailyReflections
                    : item.voiceText !== undefined
                      ? () => onListenText(item.voiceText ?? item.title)
                      : undefined
                }
                onPlay={
                  isDailyReflections || isSponsorCheckIn || isAdditionalSuggestions
                    ? undefined
                    : () => onPlayItem(item.id)
                }
                onOpenReader={
                  isDailyReflections
                    ? onReadDailyReflections
                    : item.readerLabel
                      ? () => onOpenReader(item.title, item.readerUrl ?? null)
                      : undefined
                }
              />
              {item.id === "bb-60-63" ? (
                <TextInput
                  style={styles.input}
                  value={item.detail ?? ""}
                  onChangeText={(value) => onSetItemDetail(item.id, value)}
                  placeholder="Edit page range (example: 60-63)"
                  placeholderTextColor="rgba(245,243,255,0.45)"
                />
              ) : null}
              {isAdditionalSuggestions ? (
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={template.sponsorSuggestions}
                  onChangeText={onSetSponsorSuggestions}
                  placeholder="Add additional suggestions"
                  placeholderTextColor="rgba(245,243,255,0.45)"
                  multiline
                />
              ) : null}
            </View>
          );
        })}
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Daily Checklist</Text>
        <Pressable style={styles.checkboxRow} onPress={onToggleGotOnKnees}>
          <View
            style={[styles.checkbox, dayState.gotOnKneesCompleted ? styles.checkboxChecked : null]}
          >
            {dayState.gotOnKneesCompleted ? <Text style={styles.checkboxTick}>✓</Text> : null}
          </View>
          <Text style={styles.checkboxLabel}>Got on knees</Text>
        </Pressable>
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Custom Prayers</Text>
        <CrudListEditor
          title="Prayer Texts"
          items={prayerItems}
          onAdd={onAddCustomPrayer}
          onChange={onUpdateCustomPrayer}
          onRemove={onRemoveCustomPrayer}
          placeholder="Type prayer text..."
        />
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Meditation Links</Text>
        {template.meditationLinks.map((entry) => (
          <View key={entry.id} style={styles.rowWrap}>
            <TextInput
              style={styles.input}
              value={entry.title}
              onChangeText={(value) => onUpdateMeditationLink(entry.id, { ...entry, title: value })}
              placeholder="Link title"
              placeholderTextColor="rgba(245,243,255,0.45)"
            />
            <TextInput
              style={styles.input}
              value={entry.url}
              onChangeText={(value) => onUpdateMeditationLink(entry.id, { ...entry, url: value })}
              placeholder="https://..."
              placeholderTextColor="rgba(245,243,255,0.45)"
              autoCapitalize="none"
            />
            <Pressable style={styles.removeBtn} onPress={() => onRemoveMeditationLink(entry.id)}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.linkBtn} onPress={onAddMeditationLink}>
          <Text style={styles.linkBtnText}>+ Add Meditation Link</Text>
        </Pressable>
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Daily Reflections</Text>
        <TextInput
          style={styles.input}
          value={template.dailyReflectionsLink}
          onChangeText={onSetDailyReflectionsLink}
          placeholder="Licensed source URL"
          placeholderTextColor="rgba(245,243,255,0.45)"
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={template.dailyReflectionsText}
          onChangeText={onSetDailyReflectionsText}
          placeholder="Reflection text or notes"
          placeholderTextColor="rgba(245,243,255,0.45)"
          multiline
        />
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Day Notes</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={dayState.notes}
          onChangeText={onSetNotes}
          placeholder="Write notes for today"
          placeholderTextColor="rgba(245,243,255,0.45)"
          multiline
        />
        <Pressable style={styles.primaryBtn} onPress={onExportPdf}>
          <Text style={styles.primaryText}>Export Morning Routine PDF</Text>
        </Pressable>
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
  sectionTitle: {
    color: routineTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
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
  rowWrap: {
    gap: 8,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
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
    backgroundColor: "rgba(52,199,89,0.4)",
    borderColor: "rgba(126,255,170,0.75)",
  },
  checkboxTick: {
    color: routineTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  checkboxLabel: {
    color: routineTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
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
  linkBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: routineTheme.radii.pill,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  linkBtnText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  primaryBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
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
});
