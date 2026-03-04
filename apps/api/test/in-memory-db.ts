import type { ComplianceEventType, IncidentStatus, IncidentType } from "@recovery/shared-types";
import type { DbPool, DbQueryResult } from "../src/db/client";
import type { AttendanceStatus } from "../src/db/repositories";

type Tenant = {
  id: string;
  name: string;
};

type User = {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  supervision_enabled: boolean;
  supervision_end_date: string | null;
};

type UserRole = {
  tenant_id: string;
  user_id: string;
  role: string;
};

type SupervisorAssignment = {
  id: number;
  tenant_id: string;
  supervisor_user_id: string;
  assigned_user_id: string;
};

type TenantConfig = {
  id: number;
  tenant_id: string;
  config_key: string;
  value_json: unknown;
  updated_by_user_id: string;
  updated_at: string;
};

type AuditLog = {
  id: number;
  tenant_id: string;
  actor_user_id: string;
  action: string;
  subject_type: string;
  subject_id: string | null;
  metadata_json: unknown;
  created_at: string;
};

type Meeting = {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius_m: number;
  created_at: string;
  created_by_user_id: string;
};

type Attendance = {
  id: string;
  tenant_id: string;
  user_id: string;
  meeting_id: string;
  check_in_at: string;
  check_out_at: string | null;
  dwell_seconds: number | null;
  status: AttendanceStatus;
  created_at: string;
};

type VerifierSignature = {
  id: string;
  tenant_id: string;
  attendance_id: string;
  verifier_user_id: string;
  signed_at: string;
  signature_blob: string;
  created_at: string;
};

type ExclusionZone = {
  id: string;
  tenant_id: string;
  label: string;
  zone_type: "CIRCLE" | "POLYGON";
  active: boolean;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number | null;
  polygon_geojson: unknown | null;
  created_at: string;
  created_by_user_id: string;
};

type UserZoneRule = {
  id: string;
  tenant_id: string;
  user_id: string;
  zone_id: string;
  buffer_m: number;
  active: boolean;
};

type Incident = {
  id: string;
  tenant_id: string;
  user_id: string;
  zone_id: string;
  incident_type: IncidentType;
  occurred_at: string;
  status: IncidentStatus;
  metadata_json: unknown;
  created_at: string;
};

type NotificationEvent = {
  id: string;
  tenant_id: string;
  user_id: string;
  channel: "EMAIL" | "SMS";
  recipient: string;
  template_key: string;
  payload_json: unknown;
  status: string;
  created_at: string;
};

type LastKnownLocation = {
  tenant_id: string;
  user_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  recorded_at: string;
  source: string;
};

type ComplianceEvent = {
  id: string;
  tenant_id: string;
  user_id: string;
  event_type: ComplianceEventType;
  occurred_at: string;
  metadata_json: unknown;
};

type SponsorConfig = {
  id: string;
  tenant_id: string;
  user_id: string;
  sponsor_name: string;
  sponsor_phone_e164: string;
  call_time_local_hhmm: string;
  repeat_rule: string;
  repeat_unit: string;
  repeat_interval: number;
  repeat_days: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
};

type MeetingFeed = {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  entity: string | null;
  entity_url: string | null;
  active: boolean;
  last_fetched_at: string | null;
  etag: string | null;
  last_modified: string | null;
  last_error: string | null;
  updated_at: string;
};

type MeetingGuideMeeting = {
  id: string;
  tenant_id: string;
  source_feed_id: string;
  slug: string;
  name: string;
  day: number | null;
  time: string | null;
  end_time: string | null;
  timezone: string | null;
  formatted_address: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  region: string | null;
  location: string | null;
  notes: string | null;
  types_json: unknown;
  conference_url: string | null;
  conference_phone: string | null;
  lat: number | null;
  lng: number | null;
  geo_status: "ok" | "missing" | "invalid" | "partial";
  geo_reason: string | null;
  geo_updated_at: string | null;
  updated_at_source: string | null;
  last_ingested_at: string;
  updated_at: string;
};

export class InMemoryDb implements DbPool {
  private tenants: Tenant[] = [];
  private users: User[] = [];
  private userRoles: UserRole[] = [];
  private supervisorAssignments: SupervisorAssignment[] = [];
  private tenantConfigs: TenantConfig[] = [];
  private auditLogs: AuditLog[] = [];
  private meetings: Meeting[] = [];
  private attendance: Attendance[] = [];
  private verifierSignatures: VerifierSignature[] = [];
  private exclusionZones: ExclusionZone[] = [];
  private userZoneRules: UserZoneRule[] = [];
  private incidents: Incident[] = [];
  private notificationEvents: NotificationEvent[] = [];
  private lastKnownLocations: LastKnownLocation[] = [];
  private complianceEvents: ComplianceEvent[] = [];
  private sponsorConfigs: SponsorConfig[] = [];
  private meetingFeeds: MeetingFeed[] = [];
  private meetingGuideMeetings: MeetingGuideMeeting[] = [];
  private supervisorAssignmentId = 1;
  private tenantConfigId = 1;
  private auditId = 1;

  addTenant(record: Tenant) {
    this.tenants.push(record);
  }

  addUser(
    record: Omit<User, "supervision_enabled" | "supervision_end_date"> & {
      supervision_enabled?: boolean;
      supervision_end_date?: string | null;
    },
  ) {
    this.users.push({
      supervision_enabled: record.supervision_enabled ?? false,
      supervision_end_date: record.supervision_end_date ?? null,
      ...record,
    });
  }

  addUserRole(record: UserRole) {
    this.userRoles.push(record);
  }

  addSupervisorAssignment(record: Omit<SupervisorAssignment, "id">) {
    this.supervisorAssignments.push({
      id: this.supervisorAssignmentId++,
      ...record,
    });
  }

  getLatestAuditForActor(actorUserId: string): AuditLog | null {
    const row = this.auditLogs
      .filter((entry) => entry.actor_user_id === actorUserId)
      .sort((left, right) => right.id - left.id)[0];
    return row ?? null;
  }

  addMeeting(record: Omit<Meeting, "created_at"> & { created_at?: string }) {
    this.meetings.push({
      created_at: record.created_at ?? new Date().toISOString(),
      ...record,
    });
  }

  getAttendanceById(attendanceId: string): Attendance | null {
    return this.attendance.find((entry) => entry.id === attendanceId) ?? null;
  }

  getIncidentsForTenant(tenantId: string): Incident[] {
    return this.incidents
      .filter((entry) => entry.tenant_id === tenantId)
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
      .map((entry) => ({ ...entry }));
  }

  getNotificationEventsForTenant(tenantId: string): NotificationEvent[] {
    return this.notificationEvents
      .filter((entry) => entry.tenant_id === tenantId)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((entry) => ({ ...entry }));
  }

  getLastKnownLocation(tenantId: string, userId: string): LastKnownLocation | null {
    const row = this.lastKnownLocations.find(
      (entry) => entry.tenant_id === tenantId && entry.user_id === userId,
    );
    return row ? { ...row } : null;
  }

  getSponsorConfig(tenantId: string, userId: string): SponsorConfig | null {
    const row = this.sponsorConfigs.find(
      (entry) => entry.tenant_id === tenantId && entry.user_id === userId,
    );
    return row ? { ...row } : null;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<DbQueryResult<Row>> {
    const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("select id, tenant_id from users where id = $1")) {
      const [userId] = params as [string];
      const user = this.users.find((entry) => entry.id === userId);
      return {
        rowCount: user ? 1 : 0,
        rows: user ? ([{ id: user.id, tenant_id: user.tenant_id }] as Row[]) : [],
      };
    }

    if (normalized.includes("select role from user_roles where tenant_id = $1 and user_id = $2")) {
      const [tenantId, userId] = params as [string, string];
      const rows = this.userRoles
        .filter((entry) => entry.tenant_id === tenantId && entry.user_id === userId)
        .map((entry) => ({ role: entry.role })) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (normalized.includes("from users where tenant_id = $1 and id = $2")) {
      const [tenantId, userId] = params as [string, string];
      const user = this.users.find((entry) => entry.tenant_id === tenantId && entry.id === userId);
      if (!user) {
        return { rowCount: 0, rows: [] };
      }
      return {
        rowCount: 1,
        rows: [
          {
            id: user.id,
            tenant_id: user.tenant_id,
            email: user.email,
            display_name: user.display_name,
          } as Row,
        ],
      };
    }

    if (normalized.includes("update users set supervision_enabled = $1")) {
      const [enabled, supervisionEndDate, tenantId, userId] = params as [
        boolean,
        string | null,
        string,
        string,
      ];
      const user = this.users.find((entry) => entry.tenant_id === tenantId && entry.id === userId);
      if (!user) {
        return { rowCount: 0, rows: [] };
      }

      user.supervision_enabled = enabled;
      user.supervision_end_date = supervisionEndDate;
      return {
        rowCount: 1,
        rows: [
          {
            id: user.id,
            tenant_id: user.tenant_id,
            supervision_enabled: user.supervision_enabled,
            supervision_end_date: user.supervision_end_date,
          } as Row,
        ],
      };
    }

    if (
      normalized.includes("from supervisor_assignments") &&
      normalized.includes("tenant_id = $1") &&
      normalized.includes("supervisor_user_id = $2") &&
      normalized.includes("assigned_user_id = $3")
    ) {
      const [tenantId, supervisorUserId, assignedUserId] = params as [string, string, string];
      const assignment = this.supervisorAssignments.find(
        (entry) =>
          entry.tenant_id === tenantId &&
          entry.supervisor_user_id === supervisorUserId &&
          entry.assigned_user_id === assignedUserId,
      );
      return {
        rowCount: assignment ? 1 : 0,
        rows: assignment ? ([{ id: assignment.id }] as Row[]) : [],
      };
    }

    if (normalized.includes("insert into tenant_config")) {
      const [tenantId, configKey, valueJson, updatedByUserId] = params as [
        string,
        string,
        string,
        string,
      ];

      const existing = this.tenantConfigs.find(
        (entry) => entry.tenant_id === tenantId && entry.config_key === configKey,
      );
      const parsedValue = JSON.parse(valueJson) as unknown;
      if (existing) {
        existing.value_json = parsedValue;
        existing.updated_by_user_id = updatedByUserId;
        existing.updated_at = new Date().toISOString();
        return { rowCount: 1, rows: [] };
      }

      this.tenantConfigs.push({
        id: this.tenantConfigId++,
        tenant_id: tenantId,
        config_key: configKey,
        value_json: parsedValue,
        updated_by_user_id: updatedByUserId,
        updated_at: new Date().toISOString(),
      });
      return { rowCount: 1, rows: [] };
    }

    if (
      normalized.includes("select value_json from tenant_config") &&
      normalized.includes("tenant_id = $1") &&
      normalized.includes("config_key = $2")
    ) {
      const [tenantId, configKey] = params as [string, string];
      const row = this.tenantConfigs.find(
        (entry) => entry.tenant_id === tenantId && entry.config_key === configKey,
      );
      return {
        rowCount: row ? 1 : 0,
        rows: row ? ([{ value_json: row.value_json }] as Row[]) : [],
      };
    }

    if (
      normalized.includes("from sponsor_config") &&
      normalized.includes("where tenant_id = $1") &&
      normalized.includes("and user_id = $2")
    ) {
      const [tenantId, userId] = params as [string, string];
      const row = this.sponsorConfigs.find(
        (entry) => entry.tenant_id === tenantId && entry.user_id === userId,
      );
      return {
        rowCount: row ? 1 : 0,
        rows: row ? ([{ ...row }] as Row[]) : [],
      };
    }

    if (normalized.includes("insert into sponsor_config")) {
      const [
        id,
        tenantId,
        userId,
        sponsorName,
        sponsorPhoneE164,
        callTimeLocalHhmm,
        repeatRule,
        repeatUnit,
        repeatInterval,
        repeatDays,
        active,
        updatedByUserId,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        number,
        string[],
        boolean,
        string,
      ];

      const nowIso = new Date().toISOString();
      const existing = this.sponsorConfigs.find(
        (entry) => entry.tenant_id === tenantId && entry.user_id === userId,
      );
      if (existing) {
        existing.sponsor_name = sponsorName;
        existing.sponsor_phone_e164 = sponsorPhoneE164;
        existing.call_time_local_hhmm = callTimeLocalHhmm;
        existing.repeat_rule = repeatRule;
        existing.repeat_unit = repeatUnit;
        existing.repeat_interval = repeatInterval;
        existing.repeat_days = [...repeatDays];
        existing.active = active;
        existing.updated_by_user_id = updatedByUserId;
        existing.updated_at = nowIso;
        return {
          rowCount: 1,
          rows: [{ ...existing } as Row],
        };
      }

      const row: SponsorConfig = {
        id,
        tenant_id: tenantId,
        user_id: userId,
        sponsor_name: sponsorName,
        sponsor_phone_e164: sponsorPhoneE164,
        call_time_local_hhmm: callTimeLocalHhmm,
        repeat_rule: repeatRule,
        repeat_unit: repeatUnit,
        repeat_interval: repeatInterval,
        repeat_days: [...repeatDays],
        active,
        created_at: nowIso,
        updated_at: nowIso,
        updated_by_user_id: updatedByUserId,
      };
      this.sponsorConfigs.push(row);
      return {
        rowCount: 1,
        rows: [{ ...row } as Row],
      };
    }

    if (normalized.includes("insert into audit_log")) {
      const [tenantId, actorUserId, action, subjectType, subjectId, metadataJson] = params as [
        string,
        string,
        string,
        string,
        string | null,
        string,
      ];

      this.auditLogs.push({
        id: this.auditId++,
        tenant_id: tenantId,
        actor_user_id: actorUserId,
        action,
        subject_type: subjectType,
        subject_id: subjectId,
        metadata_json: JSON.parse(metadataJson) as unknown,
        created_at: new Date().toISOString(),
      });
      return { rowCount: 1, rows: [] };
    }

    if (normalized.includes("insert into meetings")) {
      const [id, tenantId, name, address, lat, lng, radiusM, createdByUserId] = params as [
        string,
        string,
        string,
        string,
        number,
        number,
        number,
        string,
      ];
      const meeting: Meeting = {
        id,
        tenant_id: tenantId,
        name,
        address,
        lat,
        lng,
        radius_m: radiusM,
        created_by_user_id: createdByUserId,
        created_at: new Date().toISOString(),
      };
      this.meetings.push(meeting);
      return {
        rowCount: 1,
        rows: [meeting as Row],
      };
    }

    if (normalized.includes("insert into meeting_feeds")) {
      const [id, tenantId, name, url, entity, entityUrl, active] = params as [
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        boolean,
      ];

      const nowIso = new Date().toISOString();
      const existing = this.meetingFeeds.find(
        (entry) => entry.tenant_id === tenantId && entry.url === url,
      );

      if (existing) {
        existing.name = name;
        existing.entity = entity;
        existing.entity_url = entityUrl;
        existing.active = active;
        existing.updated_at = nowIso;
        return {
          rowCount: 1,
          rows: [
            {
              id: existing.id,
              tenant_id: existing.tenant_id,
              name: existing.name,
              url: existing.url,
              entity: existing.entity,
              entity_url: existing.entity_url,
              active: existing.active,
              last_fetched_at: existing.last_fetched_at,
              etag: existing.etag,
              last_modified: existing.last_modified,
              last_error: existing.last_error,
            } as Row,
          ],
        };
      }

      const row: MeetingFeed = {
        id,
        tenant_id: tenantId,
        name,
        url,
        entity,
        entity_url: entityUrl,
        active,
        last_fetched_at: null,
        etag: null,
        last_modified: null,
        last_error: null,
        updated_at: nowIso,
      };
      this.meetingFeeds.push(row);
      return {
        rowCount: 1,
        rows: [
          {
            id: row.id,
            tenant_id: row.tenant_id,
            name: row.name,
            url: row.url,
            entity: row.entity,
            entity_url: row.entity_url,
            active: row.active,
            last_fetched_at: row.last_fetched_at,
            etag: row.etag,
            last_modified: row.last_modified,
            last_error: row.last_error,
          } as Row,
        ],
      };
    }

    if (normalized.includes("from meeting_feeds") && normalized.includes("and active = true")) {
      const [tenantId] = params as [string];
      const rows = this.meetingFeeds
        .filter((entry) => entry.tenant_id === tenantId && entry.active)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => ({
          id: entry.id,
          tenant_id: entry.tenant_id,
          name: entry.name,
          url: entry.url,
          entity: entry.entity,
          entity_url: entry.entity_url,
          active: entry.active,
          last_fetched_at: entry.last_fetched_at,
          etag: entry.etag,
          last_modified: entry.last_modified,
          last_error: entry.last_error,
        })) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (
      normalized.includes("update meeting_feeds") &&
      normalized.includes("last_fetched_at = $1")
    ) {
      const [lastFetchedAt, etag, lastModified, lastError, tenantId, feedId] = params as [
        string,
        string | null,
        string | null,
        string | null,
        string,
        string,
      ];
      const row = this.meetingFeeds.find(
        (entry) => entry.tenant_id === tenantId && entry.id === feedId,
      );
      if (!row) {
        return { rowCount: 0, rows: [] };
      }
      row.last_fetched_at = lastFetchedAt;
      row.etag = etag ?? row.etag;
      row.last_modified = lastModified ?? row.last_modified;
      row.last_error = lastError;
      row.updated_at = new Date().toISOString();
      return { rowCount: 1, rows: [] };
    }

    if (normalized.includes("insert into meeting_guide_meetings")) {
      const [
        id,
        tenantId,
        sourceFeedId,
        slug,
        name,
        day,
        time,
        endTime,
        timezone,
        formattedAddress,
        address,
        city,
        state,
        postalCode,
        country,
        region,
        location,
        notes,
        typesJson,
        conferenceUrl,
        conferencePhone,
        lat,
        lng,
        geoStatus,
        geoReason,
        geoUpdatedAt,
        updatedAtSource,
        lastIngestedAt,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        number | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string,
        string | null,
        string | null,
        number | null,
        number | null,
        "ok" | "missing" | "invalid" | "partial",
        string | null,
        string | null,
        string | null,
        string,
      ];

      const parsedTypes = JSON.parse(typesJson) as unknown;
      const nowIso = new Date().toISOString();
      const existing = this.meetingGuideMeetings.find(
        (entry) =>
          entry.tenant_id === tenantId &&
          entry.source_feed_id === sourceFeedId &&
          entry.slug === slug,
      );

      if (existing) {
        const hasContextMismatchReason =
          typeof geoReason === "string" && geoReason.startsWith("geocode_context_");
        const preserveExistingGeo =
          existing.geo_status === "ok" && geoStatus !== "ok" && !hasContextMismatchReason;
        existing.id = id;
        existing.name = name;
        existing.day = day;
        existing.time = time;
        existing.end_time = endTime;
        existing.timezone = timezone;
        existing.formatted_address = formattedAddress;
        existing.address = address;
        existing.city = city;
        existing.state = state;
        existing.postal_code = postalCode;
        existing.country = country;
        existing.region = region;
        existing.location = location;
        existing.notes = notes;
        existing.types_json = parsedTypes;
        existing.conference_url = conferenceUrl;
        existing.conference_phone = conferencePhone;
        existing.lat = preserveExistingGeo ? existing.lat : lat;
        existing.lng = preserveExistingGeo ? existing.lng : lng;
        existing.geo_status = preserveExistingGeo ? existing.geo_status : geoStatus;
        existing.geo_reason = preserveExistingGeo
          ? existing.geo_reason
          : geoStatus === "ok"
            ? null
            : geoReason;
        existing.geo_updated_at = preserveExistingGeo ? existing.geo_updated_at : geoUpdatedAt;
        existing.updated_at_source = updatedAtSource;
        existing.last_ingested_at = lastIngestedAt;
        existing.updated_at = nowIso;
        return { rowCount: 1, rows: [] };
      }

      this.meetingGuideMeetings.push({
        id,
        tenant_id: tenantId,
        source_feed_id: sourceFeedId,
        slug,
        name,
        day,
        time,
        end_time: endTime,
        timezone,
        formatted_address: formattedAddress,
        address,
        city,
        state,
        postal_code: postalCode,
        country,
        region,
        location,
        notes,
        types_json: parsedTypes,
        conference_url: conferenceUrl,
        conference_phone: conferencePhone,
        lat,
        lng,
        geo_status: geoStatus,
        geo_reason: geoReason,
        geo_updated_at: geoUpdatedAt,
        updated_at_source: updatedAtSource,
        last_ingested_at: lastIngestedAt,
        updated_at: nowIso,
      });
      return { rowCount: 1, rows: [] };
    }

    if (
      normalized.includes("from meeting_guide_meetings") &&
      normalized.includes("($2::int is null or day = $2)") &&
      normalized.includes("limit $3")
    ) {
      const [tenantId, dayOfWeek, limit] = params as [string, number | null, number];
      const rows = this.meetingGuideMeetings
        .filter((entry) => entry.tenant_id === tenantId)
        .filter((entry) => dayOfWeek === null || entry.day === dayOfWeek)
        .sort((left, right) => {
          if (left.day === null && right.day !== null) {
            return 1;
          }
          if (left.day !== null && right.day === null) {
            return -1;
          }
          const dayCmp = (left.day ?? 0) - (right.day ?? 0);
          if (dayCmp !== 0) {
            return dayCmp;
          }
          const timeCmp = (left.time ?? "99:99").localeCompare(right.time ?? "99:99");
          if (timeCmp !== 0) {
            return timeCmp;
          }
          return left.name.localeCompare(right.name);
        })
        .slice(0, limit)
        .map((entry) => ({ ...entry })) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (
      normalized.includes("from meeting_guide_meetings") &&
      normalized.includes("geo_status = 'ok'") &&
      normalized.includes("lat between $5 and $6 and lng between $7 and $8") &&
      normalized.includes("limit $9")
    ) {
      const [tenantId, dayOfWeek, timeFrom, timeTo, latMin, latMax, lngMin, lngMax, limit] =
        params as [
          string,
          number | null,
          string | null,
          string | null,
          number,
          number,
          number,
          number,
          number,
        ];

      const rows = this.meetingGuideMeetings
        .filter((entry) => entry.tenant_id === tenantId)
        .filter((entry) => entry.geo_status === "ok")
        .filter((entry) => dayOfWeek === null || entry.day === dayOfWeek)
        .filter((entry) => !timeFrom || (entry.time !== null && entry.time >= timeFrom))
        .filter((entry) => !timeTo || (entry.time !== null && entry.time <= timeTo))
        .filter(
          (entry) =>
            entry.lat !== null &&
            entry.lng !== null &&
            entry.lat >= latMin &&
            entry.lat <= latMax &&
            entry.lng >= lngMin &&
            entry.lng <= lngMax,
        )
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .slice(0, limit)
        .map((entry) => ({ ...entry })) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (
      normalized.includes("count(*)::int as total_meetings") &&
      normalized.includes("from meeting_guide_meetings") &&
      normalized.includes("where tenant_id = $1")
    ) {
      const [tenantId] = params as [string];
      const scoped = this.meetingGuideMeetings.filter((entry) => entry.tenant_id === tenantId);
      const withCoordinates = scoped.filter(
        (entry) => entry.lat !== null && entry.lng !== null,
      ).length;
      const withoutCoordinates = scoped.length - withCoordinates;
      const geoOk = scoped.filter((entry) => entry.geo_status === "ok").length;
      const geoMissing = scoped.filter((entry) => entry.geo_status === "missing").length;
      const geoPartial = scoped.filter((entry) => entry.geo_status === "partial").length;
      const geoInvalid = scoped.filter((entry) => entry.geo_status === "invalid").length;
      return {
        rowCount: 1,
        rows: [
          {
            total_meetings: scoped.length,
            meetings_with_coordinates: withCoordinates,
            meetings_without_coordinates: withoutCoordinates,
            meetings_geo_ok: geoOk,
            meetings_geo_missing: geoMissing,
            meetings_geo_partial: geoPartial,
            meetings_geo_invalid: geoInvalid,
          } as Row,
        ],
      };
    }

    if (normalized.includes("from meetings where tenant_id = $1 order by created_at desc")) {
      const [tenantId] = params as [string];
      const rows = this.meetings
        .filter((entry) => entry.tenant_id === tenantId)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .map((entry) => ({ ...entry })) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (normalized.includes("select id from meetings where tenant_id = $1 and id = $2 limit 1")) {
      const [tenantId, meetingId] = params as [string, string];
      const meeting = this.meetings.find(
        (entry) => entry.tenant_id === tenantId && entry.id === meetingId,
      );
      return {
        rowCount: meeting ? 1 : 0,
        rows: meeting ? ([{ id: meeting.id }] as Row[]) : [],
      };
    }

    if (normalized.includes("insert into last_known_locations")) {
      const [tenantId, userId, lat, lng, accuracyM, recordedAt, source] = params as [
        string,
        string,
        number,
        number,
        number | null,
        string,
        string,
      ];
      const existing = this.lastKnownLocations.find(
        (entry) => entry.tenant_id === tenantId && entry.user_id === userId,
      );
      if (existing) {
        existing.lat = lat;
        existing.lng = lng;
        existing.accuracy_m = accuracyM;
        existing.recorded_at = recordedAt;
        existing.source = source;
        return {
          rowCount: 1,
          rows: [{ ...existing } as Row],
        };
      }

      const row: LastKnownLocation = {
        tenant_id: tenantId,
        user_id: userId,
        lat,
        lng,
        accuracy_m: accuracyM,
        recorded_at: recordedAt,
        source,
      };
      this.lastKnownLocations.push(row);
      return {
        rowCount: 1,
        rows: [{ ...row } as Row],
      };
    }

    if (
      normalized.includes("from last_known_locations where tenant_id = $1") &&
      normalized.includes("user_id = $2")
    ) {
      const [tenantId, userId] = params as [string, string];
      const row = this.lastKnownLocations.find(
        (entry) => entry.tenant_id === tenantId && entry.user_id === userId,
      );
      return {
        rowCount: row ? 1 : 0,
        rows: row ? ([{ ...row }] as Row[]) : [],
      };
    }

    if (
      normalized.includes("from last_known_locations l") &&
      normalized.includes("where l.tenant_id = $1") &&
      normalized.includes("order by l.recorded_at desc")
    ) {
      const [tenantId, supervisorUserId] = params as [string, string | undefined];
      const rows = this.lastKnownLocations
        .filter((entry) => entry.tenant_id === tenantId)
        .filter((entry) => {
          if (!normalized.includes("inner join supervisor_assignments sa")) {
            return true;
          }
          return this.supervisorAssignments.some(
            (assignment) =>
              assignment.tenant_id === entry.tenant_id &&
              assignment.supervisor_user_id === supervisorUserId &&
              assignment.assigned_user_id === entry.user_id,
          );
        })
        .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
        .map((entry) => ({ ...entry })) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (normalized.includes("insert into attendance")) {
      const [id, tenantId, userId, meetingId, checkInAt, status] = params as [
        string,
        string,
        string,
        string,
        string,
        AttendanceStatus,
      ];
      const record: Attendance = {
        id,
        tenant_id: tenantId,
        user_id: userId,
        meeting_id: meetingId,
        check_in_at: checkInAt,
        check_out_at: null,
        dwell_seconds: null,
        status,
        created_at: new Date().toISOString(),
      };
      this.attendance.push(record);
      return {
        rowCount: 1,
        rows: [record as Row],
      };
    }

    if (
      normalized.includes("from attendance") &&
      normalized.includes("where tenant_id = $1 and id = $2 and user_id = $3")
    ) {
      const [tenantId, attendanceId, userId] = params as [string, string, string];
      const row = this.attendance.find(
        (entry) =>
          entry.tenant_id === tenantId && entry.id === attendanceId && entry.user_id === userId,
      );
      return {
        rowCount: row ? 1 : 0,
        rows: row ? ([{ ...row }] as Row[]) : [],
      };
    }

    if (normalized.includes("update attendance set check_out_at = $1")) {
      const [checkOutAt, dwellSeconds, status, tenantId, attendanceId] = params as [
        string,
        number,
        AttendanceStatus,
        string,
        string,
      ];
      const row = this.attendance.find(
        (entry) => entry.tenant_id === tenantId && entry.id === attendanceId,
      );
      if (!row) {
        return { rowCount: 0, rows: [] };
      }
      row.check_out_at = checkOutAt;
      row.dwell_seconds = dwellSeconds;
      row.status = status;
      return {
        rowCount: 1,
        rows: [{ ...row } as Row],
      };
    }

    if (
      normalized.includes("from attendance") &&
      normalized.includes("where tenant_id = $1 and id = $2") &&
      normalized.includes("limit 1")
    ) {
      const [tenantId, attendanceId] = params as [string, string];
      const row = this.attendance.find(
        (entry) => entry.tenant_id === tenantId && entry.id === attendanceId,
      );
      return {
        rowCount: row ? 1 : 0,
        rows: row ? ([{ ...row }] as Row[]) : [],
      };
    }

    if (
      normalized.includes("select id from verifier_signatures") &&
      normalized.includes("tenant_id = $1 and attendance_id = $2")
    ) {
      const [tenantId, attendanceId] = params as [string, string];
      const row = this.verifierSignatures.find(
        (entry) => entry.tenant_id === tenantId && entry.attendance_id === attendanceId,
      );
      return {
        rowCount: row ? 1 : 0,
        rows: row ? ([{ id: row.id }] as Row[]) : [],
      };
    }

    if (
      normalized.startsWith(
        "update attendance set status = $1 where tenant_id = $2 and id = $3 returning",
      )
    ) {
      const [status, tenantId, attendanceId] = params as [AttendanceStatus, string, string];
      const row = this.attendance.find(
        (entry) => entry.tenant_id === tenantId && entry.id === attendanceId,
      );
      if (!row) {
        return { rowCount: 0, rows: [] };
      }
      row.status = status;
      return {
        rowCount: 1,
        rows: [{ ...row } as Row],
      };
    }

    if (
      normalized.startsWith("update attendance set status = $1 where tenant_id = $2 and id = $3")
    ) {
      const [status, tenantId, attendanceId] = params as [AttendanceStatus, string, string];
      const row = this.attendance.find(
        (entry) => entry.tenant_id === tenantId && entry.id === attendanceId,
      );
      if (row) {
        row.status = status;
      }
      return {
        rowCount: row ? 1 : 0,
        rows: [],
      };
    }

    if (normalized.includes("insert into verifier_signatures")) {
      const [id, tenantId, attendanceId, verifierUserId, signedAt, signatureBlob] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const row: VerifierSignature = {
        id,
        tenant_id: tenantId,
        attendance_id: attendanceId,
        verifier_user_id: verifierUserId,
        signed_at: signedAt,
        signature_blob: signatureBlob,
        created_at: new Date().toISOString(),
      };
      this.verifierSignatures.push(row);
      return {
        rowCount: 1,
        rows: [],
      };
    }

    if (
      normalized.includes("from attendance a") &&
      normalized.includes("inner join meetings m") &&
      normalized.includes("where a.tenant_id = $1") &&
      normalized.includes("order by a.check_in_at desc")
    ) {
      const [tenantId, supervisorUserId] = params as [string, string | undefined];
      const rows = this.attendance
        .filter((entry) => entry.tenant_id === tenantId)
        .filter((entry) => {
          if (!normalized.includes("inner join supervisor_assignments sa")) {
            return true;
          }
          return this.supervisorAssignments.some(
            (assignment) =>
              assignment.tenant_id === entry.tenant_id &&
              assignment.supervisor_user_id === supervisorUserId &&
              assignment.assigned_user_id === entry.user_id,
          );
        })
        .map((entry) => {
          const meeting = this.meetings.find(
            (item) => item.tenant_id === entry.tenant_id && item.id === entry.meeting_id,
          );
          return {
            id: entry.id,
            tenant_id: entry.tenant_id,
            user_id: entry.user_id,
            meeting_id: entry.meeting_id,
            meeting_name: meeting?.name ?? "Unknown meeting",
            check_in_at: entry.check_in_at,
            check_out_at: entry.check_out_at,
            dwell_seconds: entry.dwell_seconds,
            status: entry.status,
          };
        })
        .sort((left, right) => right.check_in_at.localeCompare(left.check_in_at)) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (normalized.includes("insert into exclusion_zones")) {
      const [
        id,
        tenantId,
        label,
        zoneType,
        active,
        centerLat,
        centerLng,
        radiusM,
        polygonGeoJson,
        createdByUserId,
      ] = params as [
        string,
        string,
        string,
        "CIRCLE" | "POLYGON",
        boolean,
        number | null,
        number | null,
        number | null,
        string,
        string,
      ];
      const row: ExclusionZone = {
        id,
        tenant_id: tenantId,
        label,
        zone_type: zoneType,
        active,
        center_lat: centerLat,
        center_lng: centerLng,
        radius_m: radiusM,
        polygon_geojson: JSON.parse(polygonGeoJson) as unknown,
        created_at: new Date().toISOString(),
        created_by_user_id: createdByUserId,
      };
      this.exclusionZones.push(row);
      return {
        rowCount: 1,
        rows: [row as Row],
      };
    }

    if (normalized.includes("from exclusion_zones where tenant_id = $1 order by created_at desc")) {
      const [tenantId] = params as [string];
      const rows = this.exclusionZones
        .filter((entry) => entry.tenant_id === tenantId)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .map((entry) => ({ ...entry })) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (
      normalized.includes("select id from exclusion_zones") &&
      normalized.includes("tenant_id = $1 and id = $2")
    ) {
      const [tenantId, zoneId] = params as [string, string];
      const zone = this.exclusionZones.find(
        (entry) => entry.tenant_id === tenantId && entry.id === zoneId,
      );
      return {
        rowCount: zone ? 1 : 0,
        rows: zone ? ([{ id: zone.id }] as Row[]) : [],
      };
    }

    if (normalized.includes("insert into user_zone_rules")) {
      const [id, tenantId, userId, zoneId, bufferM, active] = params as [
        string,
        string,
        string,
        string,
        number,
        boolean,
      ];
      const existing = this.userZoneRules.find(
        (entry) =>
          entry.tenant_id === tenantId && entry.user_id === userId && entry.zone_id === zoneId,
      );
      if (existing) {
        existing.buffer_m = bufferM;
        existing.active = active;
        return {
          rowCount: 1,
          rows: [{ ...existing } as Row],
        };
      }

      const row: UserZoneRule = {
        id,
        tenant_id: tenantId,
        user_id: userId,
        zone_id: zoneId,
        buffer_m: bufferM,
        active,
      };
      this.userZoneRules.push(row);
      return {
        rowCount: 1,
        rows: [{ ...row } as Row],
      };
    }

    if (
      normalized.includes("from user_zone_rules r") &&
      normalized.includes("inner join exclusion_zones z") &&
      normalized.includes("where r.tenant_id = $1") &&
      normalized.includes("and r.user_id = $2")
    ) {
      const [tenantId, userId] = params as [string, string];
      const rows = this.userZoneRules
        .filter((entry) => entry.tenant_id === tenantId && entry.user_id === userId && entry.active)
        .map((entry) => {
          const zone = this.exclusionZones.find(
            (item) =>
              item.tenant_id === entry.tenant_id && item.id === entry.zone_id && item.active,
          );
          if (!zone) {
            return null;
          }
          return {
            zoneCreatedAt: zone.created_at,
            row: {
              id: entry.id,
              tenant_id: entry.tenant_id,
              user_id: entry.user_id,
              zone_id: entry.zone_id,
              buffer_m: entry.buffer_m,
              active: entry.active,
              zone_label: zone.label,
              zone_type: zone.zone_type,
              zone_active: zone.active,
              center_lat: zone.center_lat,
              center_lng: zone.center_lng,
              radius_m: zone.radius_m,
              polygon_geojson: zone.polygon_geojson,
            },
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((left, right) => right.zoneCreatedAt.localeCompare(left.zoneCreatedAt))
        .map((entry) => entry.row) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (
      normalized.includes("from incidents") &&
      normalized.includes("incident_type = $4") &&
      normalized.includes("occurred_at >= $5") &&
      normalized.includes("order by occurred_at desc")
    ) {
      const [tenantId, userId, zoneId, incidentType, since] = params as [
        string,
        string,
        string,
        IncidentType,
        string,
      ];
      const rows = this.incidents
        .filter(
          (entry) =>
            entry.tenant_id === tenantId &&
            entry.user_id === userId &&
            entry.zone_id === zoneId &&
            entry.incident_type === incidentType &&
            entry.occurred_at >= since,
        )
        .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
        .slice(0, 1)
        .map((entry) => ({ ...entry })) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (normalized.includes("insert into incidents")) {
      const [id, tenantId, userId, zoneId, incidentType, occurredAt, status, metadataJson] =
        params as [string, string, string, string, IncidentType, string, IncidentStatus, string];
      const row: Incident = {
        id,
        tenant_id: tenantId,
        user_id: userId,
        zone_id: zoneId,
        incident_type: incidentType,
        occurred_at: occurredAt,
        status,
        metadata_json: JSON.parse(metadataJson) as unknown,
        created_at: new Date().toISOString(),
      };
      this.incidents.push(row);
      return {
        rowCount: 1,
        rows: [{ ...row } as Row],
      };
    }

    if (normalized.includes("insert into compliance_events")) {
      const [id, tenantId, userId, eventType, occurredAt, metadataJson] = params as [
        string,
        string,
        string,
        ComplianceEventType,
        string,
        string,
      ];
      const row: ComplianceEvent = {
        id,
        tenant_id: tenantId,
        user_id: userId,
        event_type: eventType,
        occurred_at: occurredAt,
        metadata_json: JSON.parse(metadataJson) as unknown,
      };
      this.complianceEvents.push(row);
      return {
        rowCount: 1,
        rows: [{ ...row } as Row],
      };
    }

    if (normalized.includes("insert into notification_events")) {
      const [id, tenantId, userId, channel, recipient, templateKey, payloadJson, status] =
        params as [string, string, string, "EMAIL" | "SMS", string, string, string, string];
      const row: NotificationEvent = {
        id,
        tenant_id: tenantId,
        user_id: userId,
        channel,
        recipient,
        template_key: templateKey,
        payload_json: JSON.parse(payloadJson) as unknown,
        status,
        created_at: new Date().toISOString(),
      };
      this.notificationEvents.push(row);
      return {
        rowCount: 1,
        rows: [{ ...row } as Row],
      };
    }

    if (
      normalized.includes("from incidents i") &&
      normalized.includes("inner join exclusion_zones z") &&
      normalized.includes("where i.tenant_id = $1") &&
      normalized.includes("order by i.occurred_at desc")
    ) {
      const [tenantId, supervisorUserId] = params as [string, string | undefined];
      const rows = this.incidents
        .filter((entry) => entry.tenant_id === tenantId)
        .filter((entry) => {
          if (!normalized.includes("inner join supervisor_assignments sa")) {
            return true;
          }
          return this.supervisorAssignments.some(
            (assignment) =>
              assignment.tenant_id === entry.tenant_id &&
              assignment.supervisor_user_id === supervisorUserId &&
              assignment.assigned_user_id === entry.user_id,
          );
        })
        .map((entry) => {
          const zone = this.exclusionZones.find(
            (item) => item.tenant_id === entry.tenant_id && item.id === entry.zone_id,
          );
          return {
            ...entry,
            zone_label: zone?.label ?? "Unknown zone",
          };
        })
        .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at)) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    throw new Error(`Unsupported query in InMemoryDb: ${normalized}`);
  }

  async end(): Promise<void> {
    return;
  }
}
