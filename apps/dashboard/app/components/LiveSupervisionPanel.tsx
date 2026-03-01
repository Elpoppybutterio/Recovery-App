"use client";

import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";

type LiveSupervisionItem = {
  userId: string;
  displayName: string | null;
  lat: number;
  lng: number;
  recordedAt: string;
};

type LiveApiResponse = {
  live?: LiveSupervisionItem[];
  users?: LiveSupervisionItem[];
};

function resolveApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  return configured && configured.length > 0 ? configured : "http://localhost:3001";
}

function formatRelativeTime(isoTimestamp: string, nowMs: number): string {
  const timestampMs = Date.parse(isoTimestamp);
  if (Number.isNaN(timestampMs)) {
    return "timestamp unavailable";
  }

  const seconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (seconds < 60) {
    return `updated ${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `updated ${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `updated ${hours}h ago`;
}

export function LiveSupervisionPanel({ devUserId }: { devUserId: string }): JSX.Element {
  const [items, setItems] = useState<LiveSupervisionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    let disposed = false;

    async function poll() {
      try {
        const apiUrl = resolveApiUrl();
        const response = await fetch(`${apiUrl}/v1/supervisor/live`, {
          headers: {
            Authorization: `Bearer DEV_${devUserId}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          if (!disposed) {
            setError(`Live API responded with ${response.status}`);
            setItems([]);
            setIsLoading(false);
          }
          return;
        }

        const payload = (await response.json()) as LiveApiResponse;
        const list = payload.live ?? payload.users ?? [];

        if (!disposed) {
          setItems(list);
          setError(null);
          setIsLoading(false);
          setNowMs(Date.now());
        }
      } catch {
        if (!disposed) {
          setError("API unreachable");
          setItems([]);
          setIsLoading(false);
        }
      }
    }

    void poll();
    const pollInterval = setInterval(() => {
      void poll();
    }, 10_000);
    const freshnessInterval = setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => {
      disposed = true;
      clearInterval(pollInterval);
      clearInterval(freshnessInterval);
    };
  }, [devUserId]);

  const rows = useMemo(
    () =>
      items.map((entry) => ({
        ...entry,
        freshness: formatRelativeTime(entry.recordedAt, nowMs),
      })),
    [items, nowMs],
  );

  return (
    <section>
      <h2>Live Supervision</h2>
      <p className="muted">Polling /v1/supervisor/live every 10s</p>

      {isLoading ? <p>Loading live supervision feed...</p> : null}
      {!isLoading && error ? <p>API unreachable</p> : null}
      {!isLoading && !error && rows.length === 0 ? <p>No live user locations available.</p> : null}

      {!isLoading && !error && rows.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Coordinates</th>
              <th>Recorded At</th>
              <th>Freshness</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={`${entry.userId}:${entry.recordedAt}`}>
                <td>
                  {entry.displayName ? `${entry.displayName} (${entry.userId})` : entry.userId}
                </td>
                <td>
                  {entry.lat.toFixed(5)}, {entry.lng.toFixed(5)}
                </td>
                <td>{entry.recordedAt}</td>
                <td>{entry.freshness}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
