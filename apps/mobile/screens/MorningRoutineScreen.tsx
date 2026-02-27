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
  onTogglePrayerOnKnees,
  onOpenReader,
  onReadDailyReflections,
  onListenDailyReflections,
  onSendAmTextSponsor,
  onListenText,
  onListenThirdStepPrayer,
  onPlayItem,
  onReadThirdStepPrayer,
  onReadSeventhStepPrayer,
  onReadEleventhStepPrayer,
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
  onTogglePrayerOnKnees: (itemId: string) => void;
  onOpenReader: (itemId: string, title: string, url: string | null) => void;
  onReadDailyReflections: () => void;
  onListenDailyReflections: () => void;
  onSendAmTextSponsor: () => void;
  onListenText: (text: string) => void;
  onListenThirdStepPrayer: () => void;
  onPlayItem: (itemId: string) => void;
  onReadThirdStepPrayer: () => void;
  onReadSeventhStepPrayer: () => void;
  onReadEleventhStepPrayer: () => void;
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
        <Text style={styles.meta}>Toggle each Item you use for your morning routine.</Text>
        <Text style={styles.metaDate}>{dateLabel}</Text>
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Checklist</Text>
        {template.items.map((item) => {
          const isDailyReflections = item.id === "daily-reflections";
          const isSponsorCheckIn = item.id === "sponsor-check-in";
          const isAdditionalSuggestions = item.id === "additional-suggestions";
          const isThirdStepPrayer = item.id === "prayer-third-step";
          const isSeventhStepPrayer = item.id === "prayer-seventh-step";
          const isEleventhStepPrayer = item.id === "prayer-eleventh-step";
          const isPrayerItem = isThirdStepPrayer || isSeventhStepPrayer || isEleventhStepPrayer;
          const displayTitle = isEleventhStepPrayer ? "11th Step AM Prayer" : item.title;
          const listenText =
            item.voiceText !== undefined && item.voiceText.trim().length > 0
              ? item.voiceText
              : displayTitle;
          return (
            <View key={item.id}>
              <RoutineChecklistItem
                title={displayTitle}
                detail={item.detail}
                enabled={item.enabled}
                checked={Boolean(dayState.completedByItemId[item.id])}
                onToggle={() => onToggleItem(item.id)}
                onToggleEnabled={() => onToggleItemEnabled(item.id)}
                customActionLabel={isSponsorCheckIn ? "Send AM Text" : undefined}
                onCustomAction={isSponsorCheckIn ? onSendAmTextSponsor : undefined}
                onListen={
                  isDailyReflections
                    ? onListenDailyReflections
                    : isThirdStepPrayer
                      ? onListenThirdStepPrayer
                      : item.voiceText !== undefined && !isThirdStepPrayer
                        ? () => onListenText(listenText)
                        : undefined
                }
                onPlay={
                  isDailyReflections ||
                  isSponsorCheckIn ||
                  isAdditionalSuggestions ||
                  isThirdStepPrayer ||
                  isSeventhStepPrayer ||
                  isEleventhStepPrayer
                    ? undefined
                    : () => onPlayItem(item.id)
                }
                onOpenReader={
                  isDailyReflections
                    ? onReadDailyReflections
                    : isThirdStepPrayer
                      ? onReadThirdStepPrayer
                      : isSeventhStepPrayer
                        ? onReadSeventhStepPrayer
                        : isEleventhStepPrayer
                          ? onReadEleventhStepPrayer
                          : item.readerLabel
                            ? () => onOpenReader(item.id, displayTitle, item.readerUrl ?? null)
                            : undefined
                }
              />
              {isPrayerItem && item.enabled ? (
                <Pressable
                  style={styles.prayerCheckboxRow}
                  onPress={() => onTogglePrayerOnKnees(item.id)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      dayState.prayerOnKneesByItemId[item.id] ? styles.checkboxChecked : null,
                    ]}
                  >
                    {dayState.prayerOnKneesByItemId[item.id] ? (
                      <Text style={styles.checkboxTick}>✓</Text>
                    ) : null}
                  </View>
                  <Text style={styles.checkboxLabel}>On knees</Text>
                </Pressable>
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
  metaDate: {
    color: routineTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.85,
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
  prayerCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
    paddingBottom: 10,
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
