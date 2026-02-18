import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import appJson from "./app.json";

type Meeting = {
  id: string;
  name: string;
  address: string;
};

type AttendanceResponse = {
  attendance: {
    id: string;
    status: string;
    checkInAt: string;
    checkOutAt: string | null;
    dwellSeconds: number | null;
  };
};

type MeZone = {
  ruleId: string;
  zoneId: string;
  bufferM: number;
  zone: {
    id: string;
    type: "CIRCLE" | "POLYGON";
    centerLat: number | null;
    centerLng: number | null;
    radiusM: number | null;
  };
};

type SponsorRepeatRule = "DAILY" | "WEEKDAYS" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

type SponsorConfigPayload = {
  sponsorName: string;
  sponsorPhoneE164: string;
  callTimeLocalHhmm: string;
  repeatRule: SponsorRepeatRule;
  active: boolean;
};

const SPONSOR_REPEAT_OPTIONS: Array<{ value: SponsorRepeatRule; label: string }> = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKDAYS", label: "M-F" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Bi-weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

type GeolocationApi = {
  getCurrentPosition(
    success: (position: {
      coords: {
        latitude: number;
        longitude: number;
        accuracy?: number;
      };
    }) => void,
    error?: () => void,
    options?: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
    },
  ): void;
};

const WARNING_DISTANCE_METERS = 200 * 0.3048;
const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMetersBetween(
  leftLat: number,
  leftLng: number,
  rightLat: number,
  rightLng: number,
): number {
  const latDelta = toRadians(rightLat - leftLat);
  const lngDelta = toRadians(rightLng - leftLng);
  const leftLatRad = toRadians(leftLat);
  const rightLatRad = toRadians(rightLat);

  const value =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(leftLatRad) * Math.cos(rightLatRad) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);
  const arc = 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  return EARTH_RADIUS_METERS * arc;
}

function isNearAssignedZone(lat: number, lng: number, zones: MeZone[]): boolean {
  return zones.some((rule) => {
    if (
      rule.zone.type !== "CIRCLE" ||
      rule.zone.centerLat === null ||
      rule.zone.centerLng === null ||
      rule.zone.radiusM === null
    ) {
      return false;
    }
    const boundaryM = rule.zone.radiusM + rule.bufferM;
    const distanceM = distanceMetersBetween(lat, lng, rule.zone.centerLat, rule.zone.centerLng);
    return distanceM <= boundaryM + WARNING_DISTANCE_METERS;
  });
}

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

function toE164FromUsTenDigit(phoneDigits: string): string | null {
  if (phoneDigits.length !== 10) {
    return null;
  }
  return `+1${phoneDigits}`;
}

function to24HourText(hour12: number, minute: number, meridiem: "AM" | "PM"): string {
  const normalizedHour12 = Math.min(12, Math.max(1, Math.floor(hour12)));
  const normalizedMinute = Math.min(59, Math.max(0, Math.floor(minute)));
  let hour24 = normalizedHour12 % 12;
  if (meridiem === "PM") {
    hour24 += 12;
  }
  return `${String(hour24).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`;
}

function from24HourText(time24: string): { hour12: number; minute: number; meridiem: "AM" | "PM" } {
  const [hoursText, minutesText] = time24.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const safeHours = Number.isFinite(hours) ? Math.min(23, Math.max(0, hours)) : 17;
  const safeMinutes = Number.isFinite(minutes) ? Math.min(59, Math.max(0, minutes)) : 0;
  const meridiem: "AM" | "PM" = safeHours >= 12 ? "PM" : "AM";
  const rawHour12 = safeHours % 12;
  return {
    hour12: rawHour12 === 0 ? 12 : rawHour12,
    minute: safeMinutes,
    meridiem,
  };
}

function formatCallTime12Hour(time24: string): string {
  const { hour12, minute, meridiem } = from24HourText(time24);
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function isDueOnDate(date: Date, repeatRule: SponsorRepeatRule): boolean {
  const day = date.getDay();
  switch (repeatRule) {
    case "DAILY":
      return true;
    case "WEEKDAYS":
      return day >= 1 && day <= 5;
    case "WEEKLY":
    case "BIWEEKLY":
    case "MONTHLY":
      return true;
    default:
      return false;
  }
}

function computeNextCall(
  now: Date,
  callTimeLocalHhmm: string,
  repeatRule: SponsorRepeatRule,
): { nextAt: Date; dueToday: boolean } {
  const [hoursText, minutesText] = callTimeLocalHhmm.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  const todayAtCallTime = new Date(now);
  todayAtCallTime.setHours(hours, minutes, 0, 0);
  const dueToday = isDueOnDate(now, repeatRule);

  if (dueToday && todayAtCallTime.getTime() >= now.getTime()) {
    return { nextAt: todayAtCallTime, dueToday: true };
  }

  const next = new Date(todayAtCallTime);
  switch (repeatRule) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      break;
    case "WEEKDAYS": {
      do {
        next.setDate(next.getDate() + 1);
      } while (!isDueOnDate(next, "WEEKDAYS"));
      break;
    }
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "BIWEEKLY":
      next.setDate(next.getDate() + 14);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1);
      break;
  }

  return { nextAt: next, dueToday };
}

export default function App() {
  const extra = (appJson.expo.extra ?? {}) as Record<string, unknown>;
  const apiUrl = typeof extra.apiUrl === "string" ? extra.apiUrl : "http://localhost:3001";
  const devAuthUserId =
    typeof extra.devAuthUserId === "string" ? extra.devAuthUserId : "enduser-a1";
  const defaultSupervisionEnabled =
    typeof extra.supervisionEnabled === "boolean" ? extra.supervisionEnabled : false;
  const fallbackLat = typeof extra.fallbackLat === "number" ? extra.fallbackLat : 33.755;
  const fallbackLng = typeof extra.fallbackLng === "number" ? extra.fallbackLng : -84.39;
  const authHeader = useMemo(() => `Bearer DEV_${devAuthUserId}`, [devAuthUserId]);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttendanceId, setLastAttendanceId] = useState<string | null>(null);
  const [lastAttendanceStatus, setLastAttendanceStatus] = useState<string | null>(null);
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorPhoneDigits, setSponsorPhoneDigits] = useState("");
  const [sponsorHour12, setSponsorHour12] = useState(5);
  const [sponsorMinute, setSponsorMinute] = useState(0);
  const [sponsorMeridiem, setSponsorMeridiem] = useState<"AM" | "PM">("PM");
  const [sponsorRepeatRule, setSponsorRepeatRule] = useState<SponsorRepeatRule>("WEEKDAYS");
  const [sponsorActive, setSponsorActive] = useState(true);
  const [sponsorStatusMessage, setSponsorStatusMessage] = useState<string>(
    "Sponsor config not saved yet.",
  );
  const [savingSponsor, setSavingSponsor] = useState(false);

  const [supervisionEnabled, setSupervisionEnabled] = useState(defaultSupervisionEnabled);
  const [supervisionMessage, setSupervisionMessage] = useState<string>("Supervision mode is off.");
  const [zones, setZones] = useState<MeZone[]>([]);

  const zonesRef = useRef<MeZone[]>([]);
  const supervisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supervisionActiveRef = useRef(false);
  const lastPingLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const sponsorScheduleSummary = useMemo(() => {
    if (!sponsorActive) {
      return "Sponsor reminders disabled.";
    }

    const callTime = to24HourText(sponsorHour12, sponsorMinute, sponsorMeridiem);
    const result = computeNextCall(new Date(), callTime, sponsorRepeatRule);
    return `Next scheduled call: ${result.nextAt.toLocaleString()} • Due today: ${
      result.dueToday ? "Yes" : "No"
    }`;
  }, [sponsorActive, sponsorHour12, sponsorMinute, sponsorMeridiem, sponsorRepeatRule]);

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  function getGeolocation(): GeolocationApi | undefined {
    const navigatorValue = (
      globalThis as typeof globalThis & { navigator?: { geolocation?: GeolocationApi } }
    ).navigator;
    return navigatorValue?.geolocation;
  }

  async function requestLocationPermissionFlow() {
    if (Platform.OS !== "ios") {
      return;
    }

    const geolocation = getGeolocation();
    if (!geolocation) {
      setSupervisionMessage("Location API unavailable in this build. Using fallback coordinates.");
      return;
    }

    await new Promise<void>((resolve) => {
      geolocation.getCurrentPosition(
        () => resolve(),
        () => resolve(),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      );
    });
    setSupervisionMessage("If prompted, choose Always Allow to keep supervision active.");
  }

  async function readCurrentLocation(): Promise<{ lat: number; lng: number; accuracyM?: number }> {
    const geolocation = getGeolocation();
    if (!geolocation) {
      return {
        lat: fallbackLat,
        lng: fallbackLng,
        accuracyM: undefined,
      };
    }

    return new Promise((resolve) => {
      geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: position.coords.accuracy,
          });
        },
        () => {
          resolve({
            lat: fallbackLat,
            lng: fallbackLng,
            accuracyM: undefined,
          });
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      );
    });
  }

  async function fetchMeetings() {
    setLoadingMeetings(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/v1/meetings`, {
        headers: {
          Authorization: authHeader,
        },
      });
      if (!response.ok) {
        setError(`Meetings request failed: ${response.status}`);
        return;
      }

      const payload = (await response.json()) as { meetings?: Meeting[] };
      setMeetings(payload.meetings ?? []);
    } catch {
      setError("Unable to reach API.");
    } finally {
      setLoadingMeetings(false);
    }
  }

  async function fetchMyZones() {
    try {
      const response = await fetch(`${apiUrl}/v1/me/zones`, {
        headers: {
          Authorization: authHeader,
        },
      });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { zones?: MeZone[] };
      setZones(payload.zones ?? []);
    } catch {
      // Ignore zone fetch failure and continue pinging.
    }
  }

  async function fetchSponsorConfig() {
    try {
      const response = await fetch(`${apiUrl}/v1/me/sponsor`, {
        headers: {
          Authorization: authHeader,
        },
      });
      if (!response.ok) {
        setSponsorStatusMessage(`Sponsor config load failed: ${response.status}`);
        return;
      }

      const payload = (await response.json()) as { sponsorConfig?: SponsorConfigPayload | null };
      if (!payload.sponsorConfig) {
        setSponsorStatusMessage("Sponsor config not set.");
        return;
      }

      const config = payload.sponsorConfig;
      setSponsorName(config.sponsorName);
      setSponsorPhoneDigits(normalizePhoneDigits(config.sponsorPhoneE164));
      const parsedTime = from24HourText(config.callTimeLocalHhmm);
      setSponsorHour12(parsedTime.hour12);
      setSponsorMinute(parsedTime.minute);
      setSponsorMeridiem(parsedTime.meridiem);
      setSponsorRepeatRule(config.repeatRule);
      setSponsorActive(config.active);
      setSponsorStatusMessage(
        `Loaded sponsor config (${formatCallTime12Hour(config.callTimeLocalHhmm)}).`,
      );
    } catch {
      setSponsorStatusMessage("Sponsor config load failed: network.");
    }
  }

  function incrementHour(delta: number) {
    setSponsorHour12((previous) => {
      const next = previous + delta;
      if (next < 1) {
        return 12;
      }
      if (next > 12) {
        return 1;
      }
      return next;
    });
  }

  function incrementMinute(delta: number) {
    setSponsorMinute((previous) => {
      const next = previous + delta;
      if (next < 0) {
        return 59;
      }
      if (next > 59) {
        return 0;
      }
      return next;
    });
  }

  async function handleSaveSponsorConfig() {
    const normalizedName = sponsorName.trim();
    if (!normalizedName) {
      setSponsorStatusMessage("Sponsor name is required.");
      return;
    }

    const phoneE164 = toE164FromUsTenDigit(sponsorPhoneDigits);
    if (!phoneE164) {
      setSponsorStatusMessage("Sponsor phone must be a valid 10-digit US number.");
      return;
    }

    const payload: SponsorConfigPayload = {
      sponsorName: normalizedName,
      sponsorPhoneE164: phoneE164,
      callTimeLocalHhmm: to24HourText(sponsorHour12, sponsorMinute, sponsorMeridiem),
      repeatRule: sponsorRepeatRule,
      active: sponsorActive,
    };

    setSavingSponsor(true);
    try {
      const response = await fetch(`${apiUrl}/v1/me/sponsor`, {
        method: "PUT",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setSponsorStatusMessage(`Sponsor config save failed: ${response.status}`);
        return;
      }

      // TODO(notifications): wire Expo local notifications for sponsor reminders.
      setSponsorStatusMessage(
        `Sponsor config saved (${formatCallTime12Hour(payload.callTimeLocalHhmm)} ${payload.repeatRule}).`,
      );
    } catch {
      setSponsorStatusMessage("Sponsor config save failed: network.");
    } finally {
      setSavingSponsor(false);
    }
  }

  async function handleCheckIn(meetingId: string) {
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/v1/attendance/check-in`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meetingId }),
      });
      if (!response.ok) {
        setError(`Check-in failed: ${response.status}`);
        return;
      }

      const payload = (await response.json()) as AttendanceResponse;
      setLastAttendanceId(payload.attendance.id);
      setLastAttendanceStatus(payload.attendance.status);
    } catch {
      setError("Check-in failed: network error.");
    }
  }

  async function handleCheckOut() {
    if (!lastAttendanceId) {
      setError("No active attendance to check out.");
      return;
    }

    setError(null);
    try {
      const response = await fetch(`${apiUrl}/v1/attendance/check-out`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attendanceId: lastAttendanceId }),
      });
      if (!response.ok) {
        setError(`Check-out failed: ${response.status}`);
        return;
      }

      const payload = (await response.json()) as AttendanceResponse;
      setLastAttendanceStatus(payload.attendance.status);
    } catch {
      setError("Check-out failed: network error.");
    }
  }

  function scheduleNextPing(delayMs: number) {
    if (supervisionTimerRef.current) {
      clearTimeout(supervisionTimerRef.current);
    }
    supervisionTimerRef.current = setTimeout(() => {
      void runSupervisionTick();
    }, delayMs);
  }

  async function runSupervisionTick() {
    if (!supervisionActiveRef.current) {
      return;
    }

    const currentLocation = await readCurrentLocation();
    const nowIso = new Date().toISOString();

    try {
      const response = await fetch(`${apiUrl}/v1/location/ping`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          accuracyM: currentLocation.accuracyM,
          recordedAt: nowIso,
        }),
      });

      if (!response.ok) {
        setSupervisionMessage(`Ping failed (${response.status}). Retrying in 180s.`);
        scheduleNextPing(180_000);
        return;
      }

      const nearZone = isNearAssignedZone(
        currentLocation.lat,
        currentLocation.lng,
        zonesRef.current,
      );
      const lastLocation = lastPingLocationRef.current;
      const moving =
        lastLocation !== null &&
        distanceMetersBetween(
          lastLocation.lat,
          lastLocation.lng,
          currentLocation.lat,
          currentLocation.lng,
        ) > 25;
      lastPingLocationRef.current = { lat: currentLocation.lat, lng: currentLocation.lng };

      const nextMs = moving || nearZone ? 15_000 : 120_000;
      setSupervisionMessage(
        `Supervision active. Last ping ${nowIso}. Next ping in ${Math.round(nextMs / 1000)}s.`,
      );
      scheduleNextPing(nextMs);
    } catch {
      setSupervisionMessage("Ping failed (network). Retrying in 180s.");
      scheduleNextPing(180_000);
    }
  }

  useEffect(() => {
    // TODO(auth): Replace DEV auth headers with real auth session tokens.
    void fetchMeetings();
    void fetchSponsorConfig();
  }, []);

  useEffect(() => {
    if (!supervisionEnabled) {
      supervisionActiveRef.current = false;
      if (supervisionTimerRef.current) {
        clearTimeout(supervisionTimerRef.current);
      }
      setSupervisionMessage("Supervision mode is off.");
      return;
    }

    supervisionActiveRef.current = true;
    void (async () => {
      await requestLocationPermissionFlow();
      await fetchMyZones();
      await runSupervisionTick();
    })();

    return () => {
      supervisionActiveRef.current = false;
      if (supervisionTimerRef.current) {
        clearTimeout(supervisionTimerRef.current);
      }
    };
  }, [supervisionEnabled]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recovery Accountability (Scaffold)</Text>
      <Text style={styles.meta}>DEV user: {devAuthUserId}</Text>
      {loadingMeetings ? <Text>Loading meetings...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Refresh Meetings" onPress={() => void fetchMeetings()} />

      <View style={styles.supervisionBox}>
        <View style={styles.supervisionRow}>
          <Text style={styles.supervisionTitle}>Supervision mode</Text>
          <Switch value={supervisionEnabled} onValueChange={setSupervisionEnabled} />
        </View>
        <Text style={styles.supervisionMeta}>{supervisionMessage}</Text>
        <Text style={styles.supervisionMeta}>Zone rules loaded: {zones.length}</Text>
      </View>

      <View style={styles.sponsorBox}>
        <Text style={styles.sponsorTitle}>Sponsor</Text>
        <TextInput
          style={styles.input}
          value={sponsorName}
          onChangeText={setSponsorName}
          placeholder="Sponsor name"
        />
        <TextInput
          style={styles.input}
          value={sponsorPhoneDigits}
          onChangeText={(value) => setSponsorPhoneDigits(normalizePhoneDigits(value))}
          placeholder="Sponsor phone (10 digits)"
          keyboardType="phone-pad"
          maxLength={10}
        />

        <Text style={styles.sponsorLabel}>Call time</Text>
        <View style={styles.pickerRow}>
          <Pressable style={styles.pickerButton} onPress={() => incrementHour(-1)}>
            <Text style={styles.pickerButtonText}>-</Text>
          </Pressable>
          <Text style={styles.pickerValue}>{String(sponsorHour12).padStart(2, "0")}</Text>
          <Pressable style={styles.pickerButton} onPress={() => incrementHour(1)}>
            <Text style={styles.pickerButtonText}>+</Text>
          </Pressable>

          <Text style={styles.pickerDivider}>:</Text>

          <Pressable style={styles.pickerButton} onPress={() => incrementMinute(-1)}>
            <Text style={styles.pickerButtonText}>-</Text>
          </Pressable>
          <Text style={styles.pickerValue}>{String(sponsorMinute).padStart(2, "0")}</Text>
          <Pressable style={styles.pickerButton} onPress={() => incrementMinute(1)}>
            <Text style={styles.pickerButtonText}>+</Text>
          </Pressable>

          <Pressable
            style={styles.pickerMeridiemButton}
            onPress={() => setSponsorMeridiem((value) => (value === "AM" ? "PM" : "AM"))}
          >
            <Text style={styles.pickerMeridiemText}>{sponsorMeridiem}</Text>
          </Pressable>
        </View>

        <Text style={styles.sponsorLabel}>Repeat</Text>
        <View style={styles.repeatRow}>
          {SPONSOR_REPEAT_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.repeatChip,
                sponsorRepeatRule === option.value ? styles.repeatChipSelected : null,
              ]}
              onPress={() => setSponsorRepeatRule(option.value)}
            >
              <Text
                style={[
                  styles.repeatChipText,
                  sponsorRepeatRule === option.value ? styles.repeatChipTextSelected : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.supervisionRow}>
          <Text style={styles.sponsorLabel}>Active reminders</Text>
          <Switch value={sponsorActive} onValueChange={setSponsorActive} />
        </View>

        <Text style={styles.sponsorMeta}>{sponsorScheduleSummary}</Text>
        <Text style={styles.sponsorMeta}>{sponsorStatusMessage}</Text>
        <Button
          title={savingSponsor ? "Saving..." : "Save Sponsor Config"}
          onPress={() => void handleSaveSponsorConfig()}
          disabled={savingSponsor}
        />
      </View>

      <FlatList
        style={styles.list}
        data={meetings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemTitle}>{item.name}</Text>
            <Text style={styles.itemAddress}>{item.address}</Text>
            <Button title="Check In" onPress={() => void handleCheckIn(item.id)} />
          </View>
        )}
        ListEmptyComponent={!loadingMeetings ? <Text>No meetings found.</Text> : null}
      />
      <View style={styles.checkoutBox}>
        <Text>Last attendance: {lastAttendanceId ?? "None"}</Text>
        <Text>Last status: {lastAttendanceStatus ?? "N/A"}</Text>
        <Button title="Check Out Last Attendance" onPress={() => void handleCheckOut()} />
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 64,
    paddingHorizontal: 16,
    backgroundColor: "#f4f7fb",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  meta: {
    marginBottom: 8,
  },
  error: {
    color: "#b00020",
    marginBottom: 8,
  },
  supervisionBox: {
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    backgroundColor: "#fff",
    padding: 10,
    gap: 6,
  },
  supervisionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  supervisionTitle: {
    fontWeight: "700",
  },
  supervisionMeta: {
    color: "#475467",
    fontSize: 12,
  },
  sponsorBox: {
    marginTop: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    backgroundColor: "#fff",
    padding: 10,
    gap: 8,
  },
  sponsorTitle: {
    fontWeight: "700",
    fontSize: 16,
  },
  sponsorLabel: {
    fontWeight: "600",
    color: "#344054",
  },
  sponsorMeta: {
    color: "#475467",
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f8fafc",
  },
  pickerButtonText: {
    fontWeight: "700",
  },
  pickerValue: {
    minWidth: 24,
    textAlign: "center",
    fontWeight: "600",
  },
  pickerDivider: {
    fontWeight: "700",
  },
  pickerMeridiemButton: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#f8fafc",
  },
  pickerMeridiemText: {
    fontWeight: "600",
  },
  repeatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  repeatChip: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  repeatChipSelected: {
    borderColor: "#155eef",
    backgroundColor: "#e0eaff",
  },
  repeatChipText: {
    color: "#344054",
    fontSize: 12,
  },
  repeatChipTextSelected: {
    color: "#1d4ed8",
    fontWeight: "700",
  },
  list: {
    marginTop: 12,
  },
  item: {
    borderWidth: 1,
    borderColor: "#d9d9d9",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  itemTitle: {
    fontWeight: "700",
    marginBottom: 4,
  },
  itemAddress: {
    marginBottom: 8,
  },
  checkoutBox: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    paddingTop: 12,
  },
});
