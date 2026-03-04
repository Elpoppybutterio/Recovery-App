import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useEffect, useMemo, useRef } from "react";
import { LiquidGlassCard } from "../components/LiquidGlassCard";
import { useDwellTimer } from "../lib/hooks/useDwellTimer";
import { routineTheme } from "../theme/tokens";

export function RoutineReaderScreen({
  title,
  url,
  bodyText,
  showGotOnKneesToggle = false,
  gotOnKneesCompleted = false,
  onToggleGotOnKnees,
  onBack,
  onOpenLink,
  requiredSeconds = 20,
  dwellResetKey = null,
  onDwellEligible,
}: {
  title: string;
  url: string | null;
  bodyText?: string | null;
  showGotOnKneesToggle?: boolean;
  gotOnKneesCompleted?: boolean;
  onToggleGotOnKnees?: () => void;
  onBack: () => void;
  onOpenLink: (url: string) => void;
  requiredSeconds?: number;
  dwellResetKey?: string | null;
  onDwellEligible?: () => void;
}) {
  const hasBodyText = Boolean(bodyText && bodyText.trim().length > 0);
  const { height: windowHeight } = useWindowDimensions();
  const bodyScrollMaxHeight = Math.max(260, Math.min(windowHeight * 0.62, 560));
  const dwellSecondsRequired = Math.max(1, Math.floor(requiredSeconds));
  const dwellKey = useMemo(
    () => (dwellResetKey && dwellResetKey.trim().length > 0 ? dwellResetKey : title),
    [dwellResetKey, title],
  );
  const lastCompletedDwellKeyRef = useRef<string | null>(null);
  const { secondsVisible, isEligible } = useDwellTimer({
    requiredSeconds: dwellSecondsRequired,
    isActive: Boolean(onDwellEligible),
    resetOnInactive: true,
    resetKey: dwellKey,
  });

  useEffect(() => {
    lastCompletedDwellKeyRef.current = null;
  }, [dwellKey]);

  useEffect(() => {
    if (!onDwellEligible || !isEligible) {
      return;
    }
    if (lastCompletedDwellKeyRef.current === dwellKey) {
      return;
    }
    lastCompletedDwellKeyRef.current = dwellKey;
    onDwellEligible();
  }, [dwellKey, isEligible, onDwellEligible]);

  const paragraphs = hasBodyText
    ? bodyText!
        .split(/\n\s*\n/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.wrapContent}
      nestedScrollEnabled
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      <LiquidGlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Pressable style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
        <Text style={styles.meta}>
          {hasBodyText
            ? "Read below."
            : "Use your licensed source link. Full copyrighted text is not bundled in-app."}
        </Text>
        {onDwellEligible ? (
          <Text style={styles.meta}>
            {isEligible
              ? `Read complete (${dwellSecondsRequired}s reached)`
              : `Hold to complete: ${Math.min(secondsVisible, dwellSecondsRequired)}/${dwellSecondsRequired}s`}
          </Text>
        ) : null}
        {hasBodyText ? (
          <ScrollView
            style={[styles.bodyContainer, { maxHeight: bodyScrollMaxHeight }]}
            contentContainerStyle={styles.bodyContainerContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            {paragraphs.map((paragraph, index) => (
              <Text
                key={`paragraph-${index}`}
                style={[styles.bodyText, index < paragraphs.length - 1 ? styles.paragraph : null]}
              >
                {paragraph}
              </Text>
            ))}
          </ScrollView>
        ) : url ? (
          <Pressable style={styles.openBtn} onPress={() => onOpenLink(url)}>
            <Text style={styles.openText}>Open Link</Text>
          </Pressable>
        ) : (
          <Text style={styles.placeholder}>No source link configured yet.</Text>
        )}
        {showGotOnKneesToggle && onToggleGotOnKnees ? (
          <View style={styles.checklistWrap}>
            <Text style={styles.checklistTitle}>Daily Checklist</Text>
            <Pressable style={styles.checkboxRow} onPress={onToggleGotOnKnees}>
              <View style={[styles.checkbox, gotOnKneesCompleted ? styles.checkboxChecked : null]}>
                {gotOnKneesCompleted ? <Text style={styles.checkboxTick}>✓</Text> : null}
              </View>
              <Text style={styles.checkboxLabel}>On knees</Text>
            </Pressable>
          </View>
        ) : null}
      </LiquidGlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  wrapContent: {
    gap: 12,
    paddingBottom: 20,
  },
  card: {
    padding: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    color: routineTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    flex: 1,
  },
  meta: {
    color: routineTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  bodyContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(15,23,42,0.28)",
  },
  bodyContainerContent: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  bodyText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 26,
    fontWeight: "500",
  },
  paragraph: {
    marginBottom: 14,
  },
  placeholder: {
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
  openBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: routineTheme.radii.pill,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(124,58,237,0.38)",
  },
  openText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  checklistWrap: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingTop: 10,
    gap: 8,
  },
  checklistTitle: {
    color: routineTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
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
});
