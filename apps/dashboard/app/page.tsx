import type { JSX } from "react";
import { LiveSupervisionPanel } from "./components/LiveSupervisionPanel";

type SupervisorAttendanceItem = {
  id: string;
  status: string;
  userId: string;
  meetingName: string;
  checkInAt: string;
  checkOutAt: string | null;
  dwellSeconds: number | null;
};

async function getHealth(): Promise<string> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  try {
    const response = await fetch(`${apiUrl}/health`, { cache: "no-store" });
    if (!response.ok) {
      return `API responded with ${response.status}`;
    }

    const payload = (await response.json()) as { status?: string };
    return payload.status ?? "unknown";
  } catch {
    return "unreachable";
  }
}

async function getSupervisorAttendance(): Promise<{
  data: SupervisorAttendanceItem[];
  error: string | null;
}> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const devUserId = process.env.DASHBOARD_DEV_USER_ID ?? "supervisor-a";

  try {
    const response = await fetch(`${apiUrl}/v1/supervisor/attendance`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer DEV_${devUserId}`,
      },
    });

    if (!response.ok) {
      return {
        data: [],
        error: `Attendance API responded with ${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      attendance?: SupervisorAttendanceItem[];
    };
    return { data: payload.attendance ?? [], error: null };
  } catch {
    return {
      data: [],
      error: "Attendance API is unreachable",
    };
  }
}

export default async function HomePage(): Promise<JSX.Element> {
  const health = await getHealth();
  const attendance = await getSupervisorAttendance();
  const devUserId = process.env.DASHBOARD_DEV_USER_ID ?? "supervisor-a";

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Sober AI Dashboard (Scaffold)</h1>
      <p>API health: {health}</p>

      <LiveSupervisionPanel devUserId={devUserId} />

      <h2>Supervisor Attendance</h2>
      {attendance.error ? <p>{attendance.error}</p> : null}
      {!attendance.error && attendance.data.length === 0 ? (
        <p>No attendance records found.</p>
      ) : null}
      {!attendance.error && attendance.data.length > 0 ? (
        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: "960px" }}>
          <thead>
            <tr>
              <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: "0.5rem" }}>
                Status
              </th>
              <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: "0.5rem" }}>
                Meeting
              </th>
              <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: "0.5rem" }}>
                User
              </th>
              <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: "0.5rem" }}>
                Check-In
              </th>
              <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: "0.5rem" }}>
                Check-Out
              </th>
              <th style={{ borderBottom: "1px solid #ccc", textAlign: "left", padding: "0.5rem" }}>
                Dwell (sec)
              </th>
            </tr>
          </thead>
          <tbody>
            {attendance.data.map((record) => (
              <tr key={record.id}>
                <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                  {record.status}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                  {record.meetingName}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                  {record.userId}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                  {record.checkInAt}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                  {record.checkOutAt ?? "-"}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: "0.5rem" }}>
                  {record.dwellSeconds ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}
