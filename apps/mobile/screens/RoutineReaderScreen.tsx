import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LiquidGlassCard } from "../components/LiquidGlassCard";
import { routineTheme } from "../theme/tokens";

export function RoutineReaderScreen({
  title,
  url,
  bodyText,
  onBack,
  onOpenLink,
}: {
  title: string;
  url: string | null;
  bodyText?: string | null;
  onBack: () => void;
  onOpenLink: (url: string) => void;
}) {
  const hasBodyText = Boolean(bodyText && bodyText.trim().length > 0);
  const paragraphs = hasBodyText
    ? bodyText!
        .split(/\n\s*\n/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];

  return (
    <View style={styles.wrap}>
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
        {hasBodyText ? (
          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyScrollContent}>
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
      </LiquidGlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
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
  bodyScroll: {
    minHeight: 420,
    maxHeight: 620,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(15,23,42,0.28)",
  },
  bodyScrollContent: {
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
});
