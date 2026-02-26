import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LiquidGlassCard } from "../components/LiquidGlassCard";
import {
  clampBigBookPage,
  fetchBigBookPages,
  persistCachedBigBookPages,
  readCachedBigBookPages,
  type BigBookPagesPayload,
} from "../lib/literature/bigBookReader";
import { routineTheme } from "../theme/tokens";

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function renderHtmlAsText(html: string): string {
  return decodeBasicHtmlEntities(html)
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style>/gi, "")
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script>/gi, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<\s*\/\s*h[1-6]\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unknown error";
}

export function BigBookReaderScreen({
  title,
  subtitle,
  startPage,
  endPage,
  apiUrl,
  authHeader,
  onBack,
}: {
  title: string;
  subtitle: string;
  startPage: number;
  endPage: number;
  apiUrl: string;
  authHeader: string;
  onBack: () => void;
}) {
  const [payload, setPayload] = useState<BigBookPagesPayload | null>(null);
  const [currentPage, setCurrentPage] = useState(startPage);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const page of payload?.pages ?? []) {
      map.set(page.page, page.html);
    }
    return map;
  }, [payload]);

  const selectedPageHtml = pageMap.get(currentPage) ?? null;
  const selectedPageText = selectedPageHtml ? renderHtmlAsText(selectedPageHtml) : null;

  const refreshFromApi = useCallback(
    async (showBlockingLoader: boolean, hasFallbackContent: boolean) => {
      if (showBlockingLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const fresh = await fetchBigBookPages(apiUrl, authHeader, startPage, endPage);
        setPayload(fresh);
        setCurrentPage((value) => clampBigBookPage(value, startPage, endPage));
        await persistCachedBigBookPages(AsyncStorage, fresh);
        setError(null);
      } catch (nextError) {
        setError((current) => {
          if (hasFallbackContent) {
            return current ?? `Showing cached pages. Refresh failed: ${formatError(nextError)}`;
          }
          return formatError(nextError);
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiUrl, authHeader, endPage, startPage],
  );

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      setError(null);
      setCurrentPage(startPage);
      const cached = await readCachedBigBookPages(AsyncStorage, startPage, endPage);
      if (cancelled) {
        return;
      }

      if (cached) {
        setPayload(cached);
        setLoading(false);
        void refreshFromApi(false, true);
        return;
      }

      await refreshFromApi(true, false);
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [endPage, refreshFromApi, startPage]);

  const canGoPrev = currentPage > startPage;
  const canGoNext = currentPage < endPage;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <LiquidGlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.meta}>{subtitle}</Text>
          </View>
          <Pressable style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.navRow}>
          <Pressable
            style={[styles.navBtn, !canGoPrev ? styles.navBtnDisabled : null]}
            onPress={() =>
              setCurrentPage((value) => clampBigBookPage(value - 1, startPage, endPage))
            }
            disabled={!canGoPrev}
          >
            <Text style={styles.navText}>Prev</Text>
          </Pressable>
          <Text style={styles.pageIndicator}>{`Page ${currentPage} of ${endPage}`}</Text>
          <Pressable
            style={[styles.navBtn, !canGoNext ? styles.navBtnDisabled : null]}
            onPress={() =>
              setCurrentPage((value) => clampBigBookPage(value + 1, startPage, endPage))
            }
            disabled={!canGoNext}
          >
            <Text style={styles.navText}>Next</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={routineTheme.colors.textPrimary} />
            <Text style={styles.meta}>Loading pages...</Text>
          </View>
        ) : (
          <View style={styles.pageCard}>
            {selectedPageText ? (
              <Text style={styles.pageText}>{selectedPageText}</Text>
            ) : (
              <Text style={styles.placeholderText}>{`Page ${currentPage} unavailable.`}</Text>
            )}
          </View>
        )}

        {refreshing ? <Text style={styles.meta}>Refreshing content...</Text> : null}

        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => void refreshFromApi(true, payload !== null)}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.licenseText}>
          {payload?.licenseNotice ??
            "AAWS licensed material. Display is limited to authorized in-app use."}
        </Text>
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
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
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
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  navBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: routineTheme.radii.pill,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(124,58,237,0.28)",
  },
  navBtnDisabled: {
    opacity: 0.45,
  },
  navText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  pageIndicator: {
    color: routineTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  loadingWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
  },
  pageCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(17,24,39,0.38)",
    padding: 12,
    minHeight: 260,
  },
  pageText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 23,
  },
  placeholderText: {
    color: routineTheme.colors.textSecondary,
    fontSize: 15,
    fontStyle: "italic",
  },
  errorWrap: {
    gap: 8,
  },
  errorText: {
    color: "#fecaca",
    fontSize: 13,
    fontWeight: "600",
  },
  retryBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: routineTheme.radii.pill,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(239,68,68,0.3)",
  },
  retryText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  licenseText: {
    color: routineTheme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
});
