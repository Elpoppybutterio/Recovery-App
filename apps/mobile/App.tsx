import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, FlatList, Platform, StyleSheet, Switch, Text, View } from "react-native";
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

  const [supervisionEnabled, setSupervisionEnabled] = useState(defaultSupervisionEnabled);
  const [supervisionMessage, setSupervisionMessage] = useState<string>("Supervision mode is off.");
  const [zones, setZones] = useState<MeZone[]>([]);

  const zonesRef = useRef<MeZone[]>([]);
  const supervisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supervisionActiveRef = useRef(false);
  const lastPingLocationRef = useRef<{ lat: number; lng: number } | null>(null);

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
