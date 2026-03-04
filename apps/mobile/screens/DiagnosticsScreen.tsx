import { StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton } from "../lib/ui/AppButton";
import { GlassCard } from "../lib/ui/GlassCard";

export type DiagnosticsBuildInfo = {
  appEnv: string;
  apiUrl: string;
  appVersion: string;
  buildNumber: string;
};

export type DiagnosticsMeetingsApiHealth = {
  endpointPath: string;
  statusCode: number | null;
  errorMessage: string | null;
  errorBodySnippet: string | null;
  timestampIso: string | null;
};

export type DiagnosticsLocationStatus = {
  servicesEnabled: boolean | null;
  foregroundPermission: string;
  backgroundPermission: string;
  preciseIndicator: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  timestampIso: string | null;
};

export type DiagnosticsMeetingGeoSample = {
  meetingId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  isValidLatLng: boolean;
  distanceMeters: number | null;
  invalidReason: string | null;
};

export type DiagnosticsExportDebug = {
  selectedCount: number;
  signedCount: number;
  unsignedCount: number;
  signatureBase64Bytes: number;
  signatureUriCount: number;
  signatureUriBytes: number | null;
  dryRunStatus: string | null;
};

export type DiagnosticsExportAttempt = {
  success: boolean;
  errorMessage: string | null;
  timestampIso: string | null;
};

type DiagnosticsScreenProps = {
  buildInfo: DiagnosticsBuildInfo;
  meetingsApiHealth: DiagnosticsMeetingsApiHealth;
  locationStatus: DiagnosticsLocationStatus;
  onRefreshLocation: () => void;
  meetingIdInput: string;
  onMeetingIdInputChange: (value: string) => void;
  meetingGeoSample: DiagnosticsMeetingGeoSample | null;
  exportDebug: DiagnosticsExportDebug;
  lastExportAttempt: DiagnosticsExportAttempt | null;
  onRunExportDryRun: () => void;
  onCreateCompletedTestMeeting: () => void;
  onBack: () => void;
};

function formatTime(value: string | null): string {
  if (!value) {
    return "Unavailable";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatCoords(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) {
    return "Unavailable";
  }
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function DiagnosticsScreen({
  buildInfo,
  meetingsApiHealth,
  locationStatus,
  onRefreshLocation,
  meetingIdInput,
  onMeetingIdInputChange,
  meetingGeoSample,
  exportDebug,
  lastExportAttempt,
  onRunExportDryRun,
  onCreateCompletedTestMeeting,
  onBack,
}: DiagnosticsScreenProps) {
  return (
    <View style={styles.wrap}>
      <GlassCard style={styles.card} strong>
        <Text style={styles.title}>Diagnostics</Text>
        <Text style={styles.meta}>
          Hidden screen for geo + export debugging (dev/preview only).
        </Text>
        <View style={styles.buttonRow}>
          <AppButton title="Back to Settings" onPress={onBack} variant="secondary" />
        </View>
      </GlassCard>

      <GlassCard style={styles.card} strong>
        <Text style={styles.sectionTitle}>Build / Env</Text>
        <Text style={styles.meta}>APP_ENV: {buildInfo.appEnv || "unknown"}</Text>
        <Text style={styles.meta}>EXPO_PUBLIC_API_URL: {buildInfo.apiUrl || "unset"}</Text>
        <Text style={styles.meta}>App version: {buildInfo.appVersion}</Text>
        <Text style={styles.meta}>Build number: {buildInfo.buildNumber}</Text>
      </GlassCard>

      <GlassCard style={styles.card} strong>
        <Text style={styles.sectionTitle}>Meetings API Health</Text>
        <Text style={styles.meta}>Endpoint: {meetingsApiHealth.endpointPath || "Unavailable"}</Text>
        <Text style={styles.meta}>
          HTTP status:{" "}
          {typeof meetingsApiHealth.statusCode === "number"
            ? meetingsApiHealth.statusCode
            : "Unavailable"}
        </Text>
        <Text style={styles.meta}>
          Error: {meetingsApiHealth.errorMessage ?? "No recent request error"}
        </Text>
        <Text style={styles.meta}>
          Error body: {meetingsApiHealth.errorBodySnippet ?? "No response body captured"}
        </Text>
        <Text style={styles.meta}>Timestamp: {formatTime(meetingsApiHealth.timestampIso)}</Text>
      </GlassCard>

      <GlassCard style={styles.card} strong>
        <Text style={styles.sectionTitle}>Location Status</Text>
        <Text style={styles.meta}>
          Services enabled:{" "}
          {locationStatus.servicesEnabled === null
            ? "Unavailable"
            : locationStatus.servicesEnabled
              ? "Yes"
              : "No"}
        </Text>
        <Text style={styles.meta}>
          Foreground permission: {locationStatus.foregroundPermission}
        </Text>
        <Text style={styles.meta}>
          Background permission: {locationStatus.backgroundPermission}
        </Text>
        <Text style={styles.meta}>Precise indicator: {locationStatus.preciseIndicator}</Text>
        <Text style={styles.meta}>
          Current coords: {formatCoords(locationStatus.lat, locationStatus.lng)}
        </Text>
        <Text style={styles.meta}>
          Accuracy (m):{" "}
          {typeof locationStatus.accuracyM === "number"
            ? Math.round(locationStatus.accuracyM)
            : "Unavailable"}
        </Text>
        <Text style={styles.meta}>Timestamp: {formatTime(locationStatus.timestampIso)}</Text>
        <View style={styles.buttonRow}>
          <AppButton title="Refresh Location" onPress={onRefreshLocation} variant="secondary" />
        </View>
      </GlassCard>

      <GlassCard style={styles.card} strong>
        <Text style={styles.sectionTitle}>Meeting Geo Sample</Text>
        <TextInput
          style={styles.input}
          value={meetingIdInput}
          onChangeText={onMeetingIdInputChange}
          placeholder="Enter meeting ID"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {meetingGeoSample ? (
          <>
            <Text style={styles.meta}>Meeting ID: {meetingGeoSample.meetingId}</Text>
            <Text style={styles.meta}>Name: {meetingGeoSample.name}</Text>
            <Text style={styles.meta}>Address: {meetingGeoSample.address}</Text>
            <Text style={styles.meta}>
              Lat/Lng: {formatCoords(meetingGeoSample.lat, meetingGeoSample.lng)}
            </Text>
            <Text style={styles.meta}>
              isValidLatLng: {meetingGeoSample.isValidLatLng ? "true" : "false"}
            </Text>
            <Text style={styles.meta}>
              Distance:{" "}
              {typeof meetingGeoSample.distanceMeters === "number"
                ? `${Math.round(meetingGeoSample.distanceMeters)} m`
                : "Unavailable"}
            </Text>
            {!meetingGeoSample.isValidLatLng ? (
              <Text style={styles.errorText}>
                Reason: {meetingGeoSample.invalidReason ?? "invalid coords"}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.meta}>No meeting found for this meetingId.</Text>
        )}
      </GlassCard>

      <GlassCard style={styles.card} strong>
        <Text style={styles.sectionTitle}>Export Debug</Text>
        <Text style={styles.meta}>Selected attendance count: {exportDebug.selectedCount}</Text>
        <Text style={styles.meta}>
          Signed: {exportDebug.signedCount} • Unsigned: {exportDebug.unsignedCount}
        </Text>
        <Text style={styles.meta}>
          Signature bytes (inline/base64): {exportDebug.signatureBase64Bytes}
        </Text>
        <Text style={styles.meta}>Signature URI count: {exportDebug.signatureUriCount}</Text>
        <Text style={styles.meta}>
          Signature URI bytes:{" "}
          {exportDebug.signatureUriBytes === null ? "Unavailable" : exportDebug.signatureUriBytes}
        </Text>
        <View style={styles.buttonRow}>
          <AppButton title="Run Export Dry-Run" onPress={onRunExportDryRun} variant="secondary" />
        </View>
        <View style={styles.buttonRow}>
          <AppButton
            title="Create completed test meeting"
            onPress={onCreateCompletedTestMeeting}
            variant="secondary"
          />
        </View>
        <Text style={styles.meta}>Dry-run: {exportDebug.dryRunStatus ?? "Not run yet"}</Text>
        <Text style={styles.meta}>
          Last export:{" "}
          {lastExportAttempt
            ? lastExportAttempt.success
              ? "Success"
              : `Failed (${lastExportAttempt.errorMessage ?? "Unknown error"})`
            : "No export attempt recorded"}
        </Text>
        <Text style={styles.meta}>
          Export timestamp: {formatTime(lastExportAttempt?.timestampIso ?? null)}
        </Text>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  card: {
    gap: 8,
  },
  title: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: "#fecaca",
    fontSize: 13,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    color: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
});
