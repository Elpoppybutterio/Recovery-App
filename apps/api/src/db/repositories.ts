import {
  ComplianceEventType,
  IncidentStatus,
  IncidentType,
  Role,
  SponsorRepeatDay,
  SponsorRepeatRule,
  SponsorRepeatUnit,
} from "@recovery/shared-types";
import { randomUUID } from "node:crypto";
import type { ActorContext } from "../domain/actor";
import type { DbClient } from "./client";
import {
  boundingBoxForRadius,
  buildMeetingDedupeKey,
  haversineDistanceMeters,
  inferMeetingFormat,
  type NormalizedMeetingGuideMeeting,
} from "../meeting-guide";

interface UserRow {
  id: string;
  tenant_id: string;
}

export interface UserSupervisionRow {
  id: string;
  tenant_id: string;
  supervision_enabled: boolean;
  supervision_end_date: string | null;
}

export interface TenantUserRow {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
}

interface RoleRow {
  role: string;
}

export type AttendanceStatus = "INCOMPLETE" | "PROVISIONAL" | "VERIFIED";

export interface MeetingRow {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius_m: number;
  created_at: string;
  created_by_user_id: string;
}

export interface AttendanceRow {
  id: string;
  tenant_id: string;
  user_id: string;
  meeting_id: string;
  check_in_at: string;
  check_out_at: string | null;
  dwell_seconds: number | null;
  status: AttendanceStatus;
  created_at: string;
}

interface SignatureRow {
  id: string;
}

export interface SupervisorAttendanceRow {
  id: string;
  tenant_id: string;
  user_id: string;
  meeting_id: string;
  meeting_name: string;
  check_in_at: string;
  check_out_at: string | null;
  dwell_seconds: number | null;
  status: AttendanceStatus;
}

export interface SupervisorAttendanceFilters {
  userId?: string;
  meetingId?: string;
}

export interface SignAttendanceResult {
  attendance: AttendanceRow;
  signatureId: string;
  alreadySigned: boolean;
}

export class SignatureWindowError extends Error {
  readonly checkInAtIso: string;
  readonly windowEndsAtIso: string;

  constructor(checkInAtIso: string, windowEndsAtIso: string) {
    super("Signature is available from meeting start until 90 minutes after start.");
    this.name = "SignatureWindowError";
    this.checkInAtIso = checkInAtIso;
    this.windowEndsAtIso = windowEndsAtIso;
  }
}

export type ExclusionZoneType = "CIRCLE" | "POLYGON";

export interface ExclusionZoneRow {
  id: string;
  tenant_id: string;
  label: string;
  zone_type: ExclusionZoneType;
  active: boolean;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number | null;
  polygon_geojson: unknown | null;
  created_at: string;
  created_by_user_id: string;
}

export interface UserZoneRuleRow {
  id: string;
  tenant_id: string;
  user_id: string;
  zone_id: string;
  buffer_m: number;
  active: boolean;
}

export interface IncidentRow {
  id: string;
  tenant_id: string;
  user_id: string;
  zone_id: string;
  incident_type: IncidentType;
  occurred_at: string;
  status: IncidentStatus;
  metadata_json: unknown;
  created_at: string;
}

export interface NotificationEventRow {
  id: string;
  tenant_id: string;
  user_id: string;
  channel: "EMAIL" | "SMS";
  recipient: string;
  template_key: string;
  payload_json: unknown;
  status: string;
  created_at: string;
}

export interface LastKnownLocationRow {
  tenant_id: string;
  user_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  recorded_at: string;
  source: string;
}

export interface SupervisorLiveLocationFilters {
  userId?: string;
}

export interface ComplianceEventRow {
  id: string;
  tenant_id: string;
  user_id: string;
  event_type: ComplianceEventType;
  occurred_at: string;
  metadata_json: unknown;
}

export interface SponsorConfigRow {
  id: string;
  tenant_id: string;
  user_id: string;
  sponsor_name: string;
  sponsor_phone_e164: string;
  call_time_local_hhmm: string;
  repeat_rule: SponsorRepeatRule;
  repeat_unit: SponsorRepeatUnit;
  repeat_interval: number;
  repeat_days: SponsorRepeatDay[];
  active: boolean;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
}

export interface MeetingFeedRow {
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
}

export interface MeetingGuideMeetingRow {
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
}

export interface MeetingGuideNearbyFilters {
  format?: "in_person" | "online" | "any";
  dayOfWeek?: number;
  types?: string[];
  timeFrom?: string;
  timeTo?: string;
  limit?: number;
}

export interface NearbyMeetingRow extends MeetingGuideMeetingRow {
  distance_meters: number | null;
  inferred_format: "IN_PERSON" | "ONLINE" | "HYBRID";
  types: string[];
}

export interface UserZoneRuleWithZoneRow {
  id: string;
  tenant_id: string;
  user_id: string;
  zone_id: string;
  buffer_m: number;
  active: boolean;
  zone_label: string;
  zone_type: ExclusionZoneType;
  zone_active: boolean;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number | null;
  polygon_geojson: unknown | null;
}

export interface SupervisorIncidentRow extends IncidentRow {
  zone_label: string;
}

export interface SupervisorIncidentFilters {
  userId?: string;
  zoneId?: string;
  status?: IncidentStatus;
  type?: IncidentType;
}

const CHECK_OUT_DWELL_THRESHOLD_SECONDS = 3600;
const SIGNATURE_WINDOW_MINUTES = 90;
const SIGNATURE_WINDOW_MS = SIGNATURE_WINDOW_MINUTES * 60 * 1000;

function toRole(role: string): Role | null {
  return Object.values(Role).includes(role as Role) ? (role as Role) : null;
}

function toJsonParam(value: unknown) {
  return JSON.stringify(value ?? {});
}

function toComparableTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function scoreNearbyMeetingMetadata(meeting: NearbyMeetingRow): number {
  let score = 0;
  if (meeting.formatted_address) {
    score += 2;
  }
  if (meeting.address) {
    score += 1;
  }
  if (meeting.city) {
    score += 1;
  }
  if (meeting.state) {
    score += 1;
  }
  if (meeting.postal_code) {
    score += 1;
  }
  if (meeting.location) {
    score += 1;
  }
  if (meeting.notes) {
    score += 1;
  }
  if (meeting.conference_url) {
    score += 1;
  }
  if (meeting.conference_phone) {
    score += 1;
  }
  if (meeting.end_time) {
    score += 1;
  }
  if (meeting.types.length > 0) {
    score += Math.min(meeting.types.length, 3);
  }
  return score;
}

function preferNearbyMeeting(
  existing: NearbyMeetingRow,
  candidate: NearbyMeetingRow,
): NearbyMeetingRow {
  const existingDistance = existing.distance_meters ?? Number.POSITIVE_INFINITY;
  const candidateDistance = candidate.distance_meters ?? Number.POSITIVE_INFINITY;
  if (Math.abs(existingDistance - candidateDistance) > 1) {
    return candidateDistance < existingDistance ? candidate : existing;
  }

  const existingScore = scoreNearbyMeetingMetadata(existing);
  const candidateScore = scoreNearbyMeetingMetadata(candidate);
  if (candidateScore !== existingScore) {
    return candidateScore > existingScore ? candidate : existing;
  }

  const existingUpdated = Math.max(
    toComparableTimestamp(existing.updated_at_source),
    toComparableTimestamp(existing.last_ingested_at),
  );
  const candidateUpdated = Math.max(
    toComparableTimestamp(candidate.updated_at_source),
    toComparableTimestamp(candidate.last_ingested_at),
  );
  if (candidateUpdated !== existingUpdated) {
    return candidateUpdated > existingUpdated ? candidate : existing;
  }

  return candidate.id.localeCompare(existing.id) < 0 ? candidate : existing;
}

export function createRepositories(db: DbClient) {
  return {
    async findActorByUserId(userId: string): Promise<ActorContext | null> {
      const userResult = await db.query<UserRow>(
        "SELECT id, tenant_id FROM users WHERE id = $1 LIMIT 1",
        [userId],
      );
      const user = userResult.rows[0];
      if (!user) {
        return null;
      }

      const rolesResult = await db.query<RoleRow>(
        "SELECT role FROM user_roles WHERE tenant_id = $1 AND user_id = $2",
        [user.tenant_id, user.id],
      );
      const roles = rolesResult.rows
        .map((row) => toRole(row.role))
        .filter((role): role is Role => role !== null);

      return {
        userId: user.id,
        tenantId: user.tenant_id,
        roles,
      };
    },

    async findTenantUser(tenantId: string, userId: string): Promise<TenantUserRow | null> {
      const result = await db.query<TenantUserRow>(
        `
        SELECT id, tenant_id, email, display_name
        FROM users
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );
      return result.rows[0] ?? null;
    },

    async isSupervisorAssignedToUser(
      tenantId: string,
      supervisorUserId: string,
      assignedUserId: string,
    ): Promise<boolean> {
      const result = await db.query<{ id: string }>(
        `
        SELECT id
        FROM supervisor_assignments
        WHERE tenant_id = $1
          AND supervisor_user_id = $2
          AND assigned_user_id = $3
        LIMIT 1
      `,
        [tenantId, supervisorUserId, assignedUserId],
      );
      return Boolean(result.rows[0]);
    },

    async upsertTenantConfig(
      tenantId: string,
      configKey: string,
      value: unknown,
      updatedByUserId: string,
    ): Promise<void> {
      await db.query(
        `
        INSERT INTO tenant_config (tenant_id, config_key, value_json, updated_by_user_id)
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (tenant_id, config_key)
        DO UPDATE SET
          value_json = EXCLUDED.value_json,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = NOW()
      `,
        [tenantId, configKey, toJsonParam(value), updatedByUserId],
      );
    },

    async getTenantConfigValue(tenantId: string, configKey: string): Promise<unknown | null> {
      const result = await db.query<{ value_json: unknown }>(
        `
        SELECT value_json
        FROM tenant_config
        WHERE tenant_id = $1
          AND config_key = $2
        LIMIT 1
      `,
        [tenantId, configKey],
      );

      return result.rows[0]?.value_json ?? null;
    },

    async getSponsorConfig(tenantId: string, userId: string): Promise<SponsorConfigRow | null> {
      const result = await db.query<SponsorConfigRow>(
        `
        SELECT
          id,
          tenant_id,
          user_id,
          sponsor_name,
          sponsor_phone_e164,
          call_time_local_hhmm,
          repeat_rule,
          repeat_unit,
          repeat_interval,
          repeat_days,
          active,
          created_at,
          updated_at,
          updated_by_user_id
        FROM sponsor_config
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );

      return result.rows[0] ?? null;
    },

    async upsertSponsorConfig(
      tenantId: string,
      userId: string,
      payload: {
        sponsorName: string;
        sponsorPhoneE164: string;
        callTimeLocalHhmm: string;
        repeatUnit: SponsorRepeatUnit;
        repeatInterval: number;
        repeatDays: SponsorRepeatDay[];
        active: boolean;
      },
      updatedByUserId: string,
    ): Promise<SponsorConfigRow | null> {
      const user = await db.query<{ id: string }>(
        `
        SELECT id
        FROM users
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );
      if (!user.rows[0]) {
        return null;
      }

      const result = await db.query<SponsorConfigRow>(
        `
        INSERT INTO sponsor_config (
          id,
          tenant_id,
          user_id,
          sponsor_name,
          sponsor_phone_e164,
          call_time_local_hhmm,
          repeat_rule,
          repeat_unit,
          repeat_interval,
          repeat_days,
          active,
          updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET
          sponsor_name = EXCLUDED.sponsor_name,
          sponsor_phone_e164 = EXCLUDED.sponsor_phone_e164,
          call_time_local_hhmm = EXCLUDED.call_time_local_hhmm,
          repeat_rule = EXCLUDED.repeat_rule,
          repeat_unit = EXCLUDED.repeat_unit,
          repeat_interval = EXCLUDED.repeat_interval,
          repeat_days = EXCLUDED.repeat_days,
          active = EXCLUDED.active,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          user_id,
          sponsor_name,
          sponsor_phone_e164,
          call_time_local_hhmm,
          repeat_rule,
          repeat_unit,
          repeat_interval,
          repeat_days,
          active,
          created_at,
          updated_at,
          updated_by_user_id
      `,
        [
          randomUUID(),
          tenantId,
          userId,
          payload.sponsorName,
          payload.sponsorPhoneE164,
          payload.callTimeLocalHhmm,
          payload.repeatUnit === SponsorRepeatUnit.MONTHLY
            ? SponsorRepeatRule.MONTHLY
            : payload.repeatInterval === 2
              ? SponsorRepeatRule.BIWEEKLY
              : SponsorRepeatRule.WEEKLY,
          payload.repeatUnit,
          payload.repeatInterval,
          payload.repeatDays,
          payload.active,
          updatedByUserId,
        ],
      );

      return result.rows[0] ?? null;
    },

    async updateUserSupervision(
      tenantId: string,
      userId: string,
      enabled: boolean,
      endDate: Date | null,
    ): Promise<UserSupervisionRow | null> {
      const result = await db.query<UserSupervisionRow>(
        `
        UPDATE users
        SET supervision_enabled = $1,
            supervision_end_date = $2
        WHERE tenant_id = $3
          AND id = $4
        RETURNING
          id,
          tenant_id,
          supervision_enabled,
          supervision_end_date
      `,
        [enabled, endDate?.toISOString() ?? null, tenantId, userId],
      );

      return result.rows[0] ?? null;
    },

    async upsertLastKnownLocation(
      tenantId: string,
      userId: string,
      payload: {
        lat: number;
        lng: number;
        accuracyM?: number;
        recordedAt: Date;
        source?: string;
      },
    ): Promise<LastKnownLocationRow | null> {
      const user = await db.query<{ id: string }>(
        `
        SELECT id
        FROM users
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );
      if (!user.rows[0]) {
        return null;
      }

      const result = await db.query<LastKnownLocationRow>(
        `
        INSERT INTO last_known_locations (
          tenant_id,
          user_id,
          lat,
          lng,
          accuracy_m,
          recorded_at,
          source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          accuracy_m = EXCLUDED.accuracy_m,
          recorded_at = EXCLUDED.recorded_at,
          source = EXCLUDED.source
        RETURNING
          tenant_id,
          user_id,
          lat,
          lng,
          accuracy_m,
          recorded_at,
          source
      `,
        [
          tenantId,
          userId,
          payload.lat,
          payload.lng,
          payload.accuracyM ?? null,
          payload.recordedAt.toISOString(),
          payload.source ?? "MOBILE",
        ],
      );

      return result.rows[0] ?? null;
    },

    async getLastKnownLocation(
      tenantId: string,
      userId: string,
    ): Promise<LastKnownLocationRow | null> {
      const result = await db.query<LastKnownLocationRow>(
        `
        SELECT
          tenant_id,
          user_id,
          lat,
          lng,
          accuracy_m,
          recorded_at,
          source
        FROM last_known_locations
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );

      return result.rows[0] ?? null;
    },

    async listSupervisorLiveLocations(
      tenantId: string,
      supervisorUserId: string,
      includeAllUsers: boolean,
      filters: SupervisorLiveLocationFilters = {},
    ): Promise<LastKnownLocationRow[]> {
      const rows = includeAllUsers
        ? await db.query<LastKnownLocationRow>(
            `
            SELECT
              l.tenant_id,
              l.user_id,
              l.lat,
              l.lng,
              l.accuracy_m,
              l.recorded_at,
              l.source
            FROM last_known_locations l
            WHERE l.tenant_id = $1
            ORDER BY l.recorded_at DESC
          `,
            [tenantId],
          )
        : await db.query<LastKnownLocationRow>(
            `
            SELECT
              l.tenant_id,
              l.user_id,
              l.lat,
              l.lng,
              l.accuracy_m,
              l.recorded_at,
              l.source
            FROM last_known_locations l
            INNER JOIN supervisor_assignments sa
              ON sa.tenant_id = l.tenant_id
             AND sa.supervisor_user_id = $2
             AND sa.assigned_user_id = l.user_id
            WHERE l.tenant_id = $1
            ORDER BY l.recorded_at DESC
          `,
            [tenantId, supervisorUserId],
          );

      return rows.rows.filter((row) => {
        if (filters.userId && row.user_id !== filters.userId) {
          return false;
        }
        return true;
      });
    },

    async createComplianceEvent(
      tenantId: string,
      userId: string,
      eventType: ComplianceEventType,
      metadata: Record<string, unknown> | undefined,
      occurredAt: Date,
    ): Promise<ComplianceEventRow | null> {
      const user = await db.query<{ id: string }>(
        `
        SELECT id
        FROM users
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );
      if (!user.rows[0]) {
        return null;
      }

      const result = await db.query<ComplianceEventRow>(
        `
        INSERT INTO compliance_events (
          id,
          tenant_id,
          user_id,
          event_type,
          occurred_at,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING
          id,
          tenant_id,
          user_id,
          event_type,
          occurred_at,
          metadata_json
      `,
        [
          randomUUID(),
          tenantId,
          userId,
          eventType,
          occurredAt.toISOString(),
          toJsonParam(metadata),
        ],
      );

      return result.rows[0] ?? null;
    },

    async createMeeting(
      tenantId: string,
      createdByUserId: string,
      payload: { name: string; address: string; lat: number; lng: number; radiusM: number },
    ): Promise<MeetingRow> {
      const result = await db.query<MeetingRow>(
        `
        INSERT INTO meetings (
          id,
          tenant_id,
          name,
          address,
          lat,
          lng,
          radius_m,
          created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          tenant_id,
          name,
          address,
          lat,
          lng,
          radius_m,
          created_at,
          created_by_user_id
      `,
        [
          randomUUID(),
          tenantId,
          payload.name,
          payload.address,
          payload.lat,
          payload.lng,
          payload.radiusM,
          createdByUserId,
        ],
      );

      return result.rows[0];
    },

    async listMeetings(tenantId: string): Promise<MeetingRow[]> {
      const result = await db.query<MeetingRow>(
        `
        SELECT
          id,
          tenant_id,
          name,
          address,
          lat,
          lng,
          radius_m,
          created_at,
          created_by_user_id
        FROM meetings
        WHERE tenant_id = $1
        ORDER BY created_at DESC
      `,
        [tenantId],
      );
      return result.rows;
    },

    meetingFeeds: {
      async upsert(
        tenantId: string,
        payload: {
          name: string;
          url: string;
          entity?: string;
          entityUrl?: string;
          active?: boolean;
        },
      ): Promise<MeetingFeedRow> {
        const result = await db.query<MeetingFeedRow>(
          `
          INSERT INTO meeting_feeds (
            id,
            tenant_id,
            name,
            url,
            entity,
            entity_url,
            active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (tenant_id, url)
          DO UPDATE SET
            name = EXCLUDED.name,
            entity = EXCLUDED.entity,
            entity_url = EXCLUDED.entity_url,
            active = EXCLUDED.active,
            updated_at = NOW()
          RETURNING
            id,
            tenant_id,
            name,
            url,
            entity,
            entity_url,
            active,
            last_fetched_at,
            etag,
            last_modified,
            last_error
        `,
          [
            randomUUID(),
            tenantId,
            payload.name,
            payload.url,
            payload.entity ?? null,
            payload.entityUrl ?? null,
            payload.active ?? true,
          ],
        );

        return result.rows[0];
      },

      async listActive(tenantId: string): Promise<MeetingFeedRow[]> {
        const result = await db.query<MeetingFeedRow>(
          `
          SELECT
            id,
            tenant_id,
            name,
            url,
            entity,
            entity_url,
            active,
            last_fetched_at,
            etag,
            last_modified,
            last_error
          FROM meeting_feeds
          WHERE tenant_id = $1
            AND active = TRUE
          ORDER BY name ASC
        `,
          [tenantId],
        );
        return result.rows;
      },

      async markFetchResult(
        tenantId: string,
        feedId: string,
        payload: {
          etag?: string | null;
          lastModified?: string | null;
          lastError?: string | null;
          fetchedAt: Date;
        },
      ): Promise<void> {
        await db.query(
          `
          UPDATE meeting_feeds
          SET
            last_fetched_at = $1,
            etag = COALESCE($2, etag),
            last_modified = COALESCE($3, last_modified),
            last_error = $4,
            updated_at = NOW()
          WHERE tenant_id = $5
            AND id = $6
        `,
          [
            payload.fetchedAt.toISOString(),
            payload.etag ?? null,
            payload.lastModified ?? null,
            payload.lastError ?? null,
            tenantId,
            feedId,
          ],
        );
      },
    },

    meetingGuideMeetings: {
      async upsertForFeed(
        tenantId: string,
        sourceFeedId: string,
        meetings: NormalizedMeetingGuideMeeting[],
        now: Date,
      ): Promise<number> {
        let upserted = 0;
        for (const meeting of meetings) {
          const stableId = `${tenantId}:${sourceFeedId}:${meeting.slug}`;
          await db.query(
            `
            INSERT INTO meeting_guide_meetings (
              id,
              tenant_id,
              source_feed_id,
              slug,
              name,
              day,
              time,
              end_time,
              timezone,
              formatted_address,
              address,
              city,
              state,
              postal_code,
              country,
              region,
              location,
              notes,
              types_json,
              conference_url,
              conference_phone,
              lat,
              lng,
              geo_status,
              geo_reason,
              geo_updated_at,
              updated_at_source,
              last_ingested_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20,
              $21, $22, $23, $24, $25, $26, $27, $28
            )
            ON CONFLICT (tenant_id, source_feed_id, slug)
            DO UPDATE SET
              name = EXCLUDED.name,
              day = EXCLUDED.day,
              time = EXCLUDED.time,
              end_time = EXCLUDED.end_time,
              timezone = EXCLUDED.timezone,
              formatted_address = EXCLUDED.formatted_address,
              address = EXCLUDED.address,
              city = EXCLUDED.city,
              state = EXCLUDED.state,
              postal_code = EXCLUDED.postal_code,
              country = EXCLUDED.country,
              region = EXCLUDED.region,
              location = EXCLUDED.location,
              notes = EXCLUDED.notes,
              types_json = EXCLUDED.types_json,
              conference_url = EXCLUDED.conference_url,
              conference_phone = EXCLUDED.conference_phone,
              lat = CASE
                WHEN EXCLUDED.geo_status = 'ok' THEN EXCLUDED.lat
                WHEN meeting_guide_meetings.geo_status = 'ok' THEN meeting_guide_meetings.lat
                ELSE EXCLUDED.lat
              END,
              lng = CASE
                WHEN EXCLUDED.geo_status = 'ok' THEN EXCLUDED.lng
                WHEN meeting_guide_meetings.geo_status = 'ok' THEN meeting_guide_meetings.lng
                ELSE EXCLUDED.lng
              END,
              geo_status = CASE
                WHEN EXCLUDED.geo_status = 'ok' THEN EXCLUDED.geo_status
                WHEN meeting_guide_meetings.geo_status = 'ok' THEN meeting_guide_meetings.geo_status
                ELSE EXCLUDED.geo_status
              END,
              geo_reason = CASE
                WHEN EXCLUDED.geo_status = 'ok' THEN NULL
                WHEN meeting_guide_meetings.geo_status = 'ok' THEN meeting_guide_meetings.geo_reason
                ELSE EXCLUDED.geo_reason
              END,
              geo_updated_at = CASE
                WHEN EXCLUDED.geo_status = 'ok' THEN EXCLUDED.geo_updated_at
                WHEN meeting_guide_meetings.geo_status = 'ok' THEN meeting_guide_meetings.geo_updated_at
                ELSE EXCLUDED.geo_updated_at
              END,
              updated_at_source = EXCLUDED.updated_at_source,
              last_ingested_at = EXCLUDED.last_ingested_at,
              updated_at = NOW()
          `,
            [
              stableId,
              tenantId,
              sourceFeedId,
              meeting.slug,
              meeting.name,
              meeting.day,
              meeting.time,
              meeting.endTime,
              meeting.timezone,
              meeting.formattedAddress,
              meeting.address,
              meeting.city,
              meeting.state,
              meeting.postalCode,
              meeting.country,
              meeting.region,
              meeting.location,
              meeting.notes,
              toJsonParam(meeting.types),
              meeting.conferenceUrl,
              meeting.conferencePhone,
              meeting.lat,
              meeting.lng,
              meeting.geoStatus ??
                (meeting.lat !== null && meeting.lng !== null
                  ? "ok"
                  : meeting.lat === null && meeting.lng === null
                    ? "missing"
                    : "partial"),
              meeting.geoReason ??
                (meeting.lat !== null && meeting.lng !== null
                  ? null
                  : meeting.lat === null && meeting.lng === null
                    ? "missing_coordinates"
                    : meeting.lat === null
                      ? "missing_latitude"
                      : "missing_longitude"),
              meeting.geoUpdatedAt ?? now.toISOString(),
              meeting.updatedAtSource,
              now.toISOString(),
            ],
          );
          upserted += 1;
        }
        return upserted;
      },

      async list(
        tenantId: string,
        filters: { dayOfWeek?: number; limit?: number } = {},
      ): Promise<MeetingGuideMeetingRow[]> {
        const limit = Math.max(1, Math.min(filters.limit ?? 500, 2000));
        const result = await db.query<MeetingGuideMeetingRow>(
          `
          SELECT
            id,
            tenant_id,
            source_feed_id,
            slug,
            name,
            day,
            time,
            end_time,
            timezone,
            formatted_address,
            address,
            city,
            state,
            postal_code,
            country,
            region,
            location,
            notes,
            types_json,
            conference_url,
            conference_phone,
            lat,
            lng,
            geo_status,
            geo_reason,
            geo_updated_at,
            updated_at_source,
            last_ingested_at
          FROM meeting_guide_meetings
          WHERE tenant_id = $1
            AND ($2::int IS NULL OR day = $2)
          ORDER BY
            day ASC NULLS LAST,
            time ASC NULLS LAST,
            name ASC
          LIMIT $3
        `,
          [tenantId, filters.dayOfWeek ?? null, limit],
        );

        return result.rows;
      },

      async listNearby(
        tenantId: string,
        center: { lat: number; lng: number; radiusMiles: number },
        filters: MeetingGuideNearbyFilters = {},
      ): Promise<NearbyMeetingRow[]> {
        const bounds = boundingBoxForRadius(center);
        const limit = Math.max(1, Math.min(filters.limit ?? 500, 500));
        const format = filters.format ?? "any";

        const candidates = await db.query<MeetingGuideMeetingRow>(
          `
          SELECT
            id,
            tenant_id,
            source_feed_id,
            slug,
            name,
            day,
            time,
            end_time,
            timezone,
            formatted_address,
            address,
            city,
            state,
            postal_code,
            country,
            region,
            location,
            notes,
            types_json,
            conference_url,
            conference_phone,
            lat,
            lng,
            geo_status,
            geo_reason,
            geo_updated_at,
            updated_at_source,
            last_ingested_at
          FROM meeting_guide_meetings
          WHERE tenant_id = $1
            AND geo_status = 'ok'
            AND ($2::int IS NULL OR day = $2)
            AND ($3::text IS NULL OR time >= $3)
            AND ($4::text IS NULL OR time <= $4)
            AND (
              lat BETWEEN $5 AND $6 AND lng BETWEEN $7 AND $8
            )
          ORDER BY updated_at DESC
          LIMIT $9
        `,
          [
            tenantId,
            filters.dayOfWeek ?? null,
            filters.timeFrom ?? null,
            filters.timeTo ?? null,
            bounds.latMin,
            bounds.latMax,
            bounds.lngMin,
            bounds.lngMax,
            limit * 2,
          ],
        );

        const normalized = candidates.rows
          .map((row): NearbyMeetingRow | null => {
            const rawTypes = Array.isArray(row.types_json) ? row.types_json : [];
            const types = rawTypes
              .map((entry) => (typeof entry === "string" ? entry.toUpperCase() : null))
              .filter((entry): entry is string => entry !== null);
            const inferredFormat = inferMeetingFormat({
              conferenceUrl: row.conference_url,
              lat: row.lat,
              lng: row.lng,
              formattedAddress: row.formatted_address,
            });

            let distanceMeters: number | null = null;
            if (row.lat !== null && row.lng !== null) {
              distanceMeters = haversineDistanceMeters(center.lat, center.lng, row.lat, row.lng);
              if (distanceMeters > center.radiusMiles * 1609.344) {
                return null;
              }
            } else {
              return null;
            }

            if (filters.types && filters.types.length > 0) {
              const target = new Set(filters.types.map((entry) => entry.toUpperCase()));
              if (!types.some((code) => target.has(code))) {
                return null;
              }
            }

            if (format === "in_person" && inferredFormat === "ONLINE") {
              return null;
            }
            if (format === "online" && inferredFormat === "IN_PERSON") {
              return null;
            }

            return {
              ...row,
              distance_meters: distanceMeters,
              inferred_format: inferredFormat,
              types,
            };
          })
          .filter((row): row is NearbyMeetingRow => row !== null);

        const dedupedByKey = new Map<string, NearbyMeetingRow>();
        for (const meeting of normalized) {
          const dedupeKey = buildMeetingDedupeKey({
            name: meeting.name,
            day: meeting.day,
            time: meeting.time,
            formattedAddress: meeting.formatted_address,
            address: meeting.address,
            lat: meeting.lat,
            lng: meeting.lng,
          });
          const existing = dedupedByKey.get(dedupeKey);
          if (!existing) {
            dedupedByKey.set(dedupeKey, meeting);
            continue;
          }
          dedupedByKey.set(dedupeKey, preferNearbyMeeting(existing, meeting));
        }

        const dedupedMeetings = Array.from(dedupedByKey.values());
        const sorted = dedupedMeetings.sort((left, right) => {
          if (filters.dayOfWeek !== undefined) {
            const leftTime = left.time ?? "99:99";
            const rightTime = right.time ?? "99:99";
            if (leftTime !== rightTime) {
              return leftTime.localeCompare(rightTime);
            }
          }

          const leftDistance = left.distance_meters ?? Number.POSITIVE_INFINITY;
          const rightDistance = right.distance_meters ?? Number.POSITIVE_INFINITY;
          if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
          }

          return (left.time ?? "99:99").localeCompare(right.time ?? "99:99");
        });

        return sorted.slice(0, limit);
      },
    },

    async checkInAttendance(
      tenantId: string,
      userId: string,
      meetingId: string,
      now: Date,
    ): Promise<AttendanceRow | null> {
      const meeting = await db.query<{ id: string }>(
        `
        SELECT id
        FROM meetings
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
      `,
        [tenantId, meetingId],
      );
      if (!meeting.rows[0]) {
        return null;
      }

      const result = await db.query<AttendanceRow>(
        `
        INSERT INTO attendance (
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          check_out_at,
          dwell_seconds,
          status,
          created_at
      `,
        [randomUUID(), tenantId, userId, meetingId, now.toISOString(), "INCOMPLETE"],
      );

      return result.rows[0];
    },

    async checkOutAttendance(
      tenantId: string,
      userId: string,
      attendanceId: string,
      now: Date,
    ): Promise<AttendanceRow | null> {
      const existing = await db.query<AttendanceRow>(
        `
        SELECT
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          check_out_at,
          dwell_seconds,
          status,
          created_at
        FROM attendance
        WHERE tenant_id = $1 AND id = $2 AND user_id = $3
        LIMIT 1
      `,
        [tenantId, attendanceId, userId],
      );
      const attendance = existing.rows[0];
      if (!attendance) {
        return null;
      }

      const checkInAt = new Date(attendance.check_in_at);
      const dwellSeconds = Math.max(0, Math.floor((now.getTime() - checkInAt.getTime()) / 1000));
      const status: AttendanceStatus =
        dwellSeconds >= CHECK_OUT_DWELL_THRESHOLD_SECONDS ? "PROVISIONAL" : "INCOMPLETE";

      const updated = await db.query<AttendanceRow>(
        `
        UPDATE attendance
        SET check_out_at = $1,
            dwell_seconds = $2,
            status = $3
        WHERE tenant_id = $4 AND id = $5
        RETURNING
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          check_out_at,
          dwell_seconds,
          status,
          created_at
      `,
        [now.toISOString(), dwellSeconds, status, tenantId, attendanceId],
      );

      return updated.rows[0] ?? null;
    },

    async signAttendance(
      tenantId: string,
      attendanceId: string,
      verifierUserId: string,
      signatureBlob: string,
      now: Date,
    ): Promise<SignAttendanceResult | null> {
      const attendance = await db.query<AttendanceRow>(
        `
        SELECT
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          check_out_at,
          dwell_seconds,
          status,
          created_at
        FROM attendance
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
      `,
        [tenantId, attendanceId],
      );
      if (!attendance.rows[0]) {
        return null;
      }
      const checkInAtIso = attendance.rows[0].check_in_at;
      const checkInAtMs = Date.parse(checkInAtIso);
      if (!Number.isNaN(checkInAtMs)) {
        const windowEndsAtMs = checkInAtMs + SIGNATURE_WINDOW_MS;
        const nowMs = now.getTime();
        if (nowMs < checkInAtMs || nowMs > windowEndsAtMs) {
          throw new SignatureWindowError(checkInAtIso, new Date(windowEndsAtMs).toISOString());
        }
      }

      const existingSignature = await db.query<SignatureRow>(
        `
        SELECT id
        FROM verifier_signatures
        WHERE tenant_id = $1 AND attendance_id = $2
        LIMIT 1
      `,
        [tenantId, attendanceId],
      );

      if (existingSignature.rows[0]) {
        await db.query(`UPDATE attendance SET status = $1 WHERE tenant_id = $2 AND id = $3`, [
          "VERIFIED",
          tenantId,
          attendanceId,
        ]);
        const refreshed = await db.query<AttendanceRow>(
          `
          SELECT
            id,
            tenant_id,
            user_id,
            meeting_id,
            check_in_at,
            check_out_at,
            dwell_seconds,
            status,
            created_at
          FROM attendance
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1
        `,
          [tenantId, attendanceId],
        );
        return {
          attendance: refreshed.rows[0],
          signatureId: existingSignature.rows[0].id,
          alreadySigned: true,
        };
      }

      const signatureId = randomUUID();
      await db.query(
        `
        INSERT INTO verifier_signatures (
          id,
          tenant_id,
          attendance_id,
          verifier_user_id,
          signed_at,
          signature_blob
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [signatureId, tenantId, attendanceId, verifierUserId, now.toISOString(), signatureBlob],
      );

      const updated = await db.query<AttendanceRow>(
        `
        UPDATE attendance
        SET status = $1
        WHERE tenant_id = $2 AND id = $3
        RETURNING
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          check_out_at,
          dwell_seconds,
          status,
          created_at
      `,
        ["VERIFIED", tenantId, attendanceId],
      );

      return {
        attendance: updated.rows[0],
        signatureId,
        alreadySigned: false,
      };
    },

    async listSupervisorAttendance(
      tenantId: string,
      supervisorUserId: string,
      includeAllUsers: boolean,
      filters: SupervisorAttendanceFilters = {},
    ): Promise<SupervisorAttendanceRow[]> {
      const rows = includeAllUsers
        ? await db.query<SupervisorAttendanceRow>(
            `
            SELECT
              a.id,
              a.tenant_id,
              a.user_id,
              a.meeting_id,
              m.name AS meeting_name,
              a.check_in_at,
              a.check_out_at,
              a.dwell_seconds,
              a.status
            FROM attendance a
            INNER JOIN meetings m
              ON m.tenant_id = a.tenant_id
             AND m.id = a.meeting_id
            WHERE a.tenant_id = $1
            ORDER BY a.check_in_at DESC
          `,
            [tenantId],
          )
        : await db.query<SupervisorAttendanceRow>(
            `
            SELECT
              a.id,
              a.tenant_id,
              a.user_id,
              a.meeting_id,
              m.name AS meeting_name,
              a.check_in_at,
              a.check_out_at,
              a.dwell_seconds,
              a.status
            FROM attendance a
            INNER JOIN meetings m
              ON m.tenant_id = a.tenant_id
             AND m.id = a.meeting_id
            INNER JOIN supervisor_assignments sa
              ON sa.tenant_id = a.tenant_id
             AND sa.supervisor_user_id = $2
             AND sa.assigned_user_id = a.user_id
            WHERE a.tenant_id = $1
            ORDER BY a.check_in_at DESC
          `,
            [tenantId, supervisorUserId],
          );

      return rows.rows.filter((row) => {
        if (filters.userId && row.user_id !== filters.userId) {
          return false;
        }
        if (filters.meetingId && row.meeting_id !== filters.meetingId) {
          return false;
        }
        return true;
      });
    },

    zones: {
      async create(
        tenantId: string,
        actorUserId: string,
        payload: {
          label: string;
          type: ExclusionZoneType;
          active: boolean;
          centerLat?: number;
          centerLng?: number;
          radiusM?: number;
          polygonGeoJson?: unknown;
        },
      ): Promise<ExclusionZoneRow> {
        const result = await db.query<ExclusionZoneRow>(
          `
          INSERT INTO exclusion_zones (
            id,
            tenant_id,
            label,
            zone_type,
            active,
            center_lat,
            center_lng,
            radius_m,
            polygon_geojson,
            created_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
          RETURNING
            id,
            tenant_id,
            label,
            zone_type,
            active,
            center_lat,
            center_lng,
            radius_m,
            polygon_geojson,
            created_at,
            created_by_user_id
        `,
          [
            randomUUID(),
            tenantId,
            payload.label,
            payload.type,
            payload.active,
            payload.centerLat ?? null,
            payload.centerLng ?? null,
            payload.radiusM ?? null,
            toJsonParam(payload.polygonGeoJson ?? null),
            actorUserId,
          ],
        );

        return result.rows[0];
      },

      async list(tenantId: string): Promise<ExclusionZoneRow[]> {
        const result = await db.query<ExclusionZoneRow>(
          `
          SELECT
            id,
            tenant_id,
            label,
            zone_type,
            active,
            center_lat,
            center_lng,
            radius_m,
            polygon_geojson,
            created_at,
            created_by_user_id
          FROM exclusion_zones
          WHERE tenant_id = $1
          ORDER BY created_at DESC
        `,
          [tenantId],
        );

        return result.rows;
      },
    },

    zoneRules: {
      async assign(
        tenantId: string,
        userId: string,
        zoneId: string,
        bufferM: number,
        active: boolean,
      ): Promise<UserZoneRuleRow | null> {
        const zone = await db.query<{ id: string }>(
          `
          SELECT id
          FROM exclusion_zones
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1
        `,
          [tenantId, zoneId],
        );
        if (!zone.rows[0]) {
          return null;
        }

        const result = await db.query<UserZoneRuleRow>(
          `
          INSERT INTO user_zone_rules (
            id,
            tenant_id,
            user_id,
            zone_id,
            buffer_m,
            active
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (tenant_id, user_id, zone_id)
          DO UPDATE SET
            buffer_m = EXCLUDED.buffer_m,
            active = EXCLUDED.active
          RETURNING
            id,
            tenant_id,
            user_id,
            zone_id,
            buffer_m,
            active
        `,
          [randomUUID(), tenantId, userId, zoneId, bufferM, active],
        );

        return result.rows[0] ?? null;
      },

      async listForUser(tenantId: string, userId: string): Promise<UserZoneRuleWithZoneRow[]> {
        const result = await db.query<UserZoneRuleWithZoneRow>(
          `
          SELECT
            r.id,
            r.tenant_id,
            r.user_id,
            r.zone_id,
            r.buffer_m,
            r.active,
            z.label AS zone_label,
            z.zone_type,
            z.active AS zone_active,
            z.center_lat,
            z.center_lng,
            z.radius_m,
            z.polygon_geojson
          FROM user_zone_rules r
          INNER JOIN exclusion_zones z
            ON z.tenant_id = r.tenant_id
           AND z.id = r.zone_id
          WHERE r.tenant_id = $1
            AND r.user_id = $2
            AND r.active = TRUE
            AND z.active = TRUE
          ORDER BY z.created_at DESC
        `,
          [tenantId, userId],
        );

        return result.rows;
      },
    },

    incidents: {
      async findRecent(
        tenantId: string,
        userId: string,
        zoneId: string,
        type: IncidentType,
        since: Date,
      ): Promise<IncidentRow | null> {
        const result = await db.query<IncidentRow>(
          `
          SELECT
            id,
            tenant_id,
            user_id,
            zone_id,
            incident_type,
            occurred_at,
            status,
            metadata_json,
            created_at
          FROM incidents
          WHERE tenant_id = $1
            AND user_id = $2
            AND zone_id = $3
            AND incident_type = $4
            AND occurred_at >= $5
          ORDER BY occurred_at DESC
          LIMIT 1
        `,
          [tenantId, userId, zoneId, type, since.toISOString()],
        );

        return result.rows[0] ?? null;
      },

      async report(
        tenantId: string,
        userId: string,
        zoneId: string,
        type: IncidentType,
        occurredAt: Date,
        metadata?: Record<string, unknown>,
      ): Promise<IncidentRow | null> {
        const zone = await db.query<{ id: string }>(
          `
          SELECT id
          FROM exclusion_zones
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1
        `,
          [tenantId, zoneId],
        );
        if (!zone.rows[0]) {
          return null;
        }

        const result = await db.query<IncidentRow>(
          `
          INSERT INTO incidents (
            id,
            tenant_id,
            user_id,
            zone_id,
            incident_type,
            occurred_at,
            status,
            metadata_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          RETURNING
            id,
            tenant_id,
            user_id,
            zone_id,
            incident_type,
            occurred_at,
            status,
            metadata_json,
            created_at
        `,
          [
            randomUUID(),
            tenantId,
            userId,
            zoneId,
            type,
            occurredAt.toISOString(),
            IncidentStatus.OPEN,
            toJsonParam(metadata),
          ],
        );

        return result.rows[0] ?? null;
      },
    },

    notificationEvents: {
      async create(
        tenantId: string,
        userId: string,
        payload: {
          channel: "EMAIL" | "SMS";
          recipient: string;
          templateKey: string;
          payload: Record<string, unknown>;
          status?: string;
        },
      ): Promise<NotificationEventRow> {
        const result = await db.query<NotificationEventRow>(
          `
          INSERT INTO notification_events (
            id,
            tenant_id,
            user_id,
            channel,
            recipient,
            template_key,
            payload_json,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
          RETURNING
            id,
            tenant_id,
            user_id,
            channel,
            recipient,
            template_key,
            payload_json,
            status,
            created_at
        `,
          [
            randomUUID(),
            tenantId,
            userId,
            payload.channel,
            payload.recipient,
            payload.templateKey,
            toJsonParam(payload.payload),
            payload.status ?? "PENDING",
          ],
        );

        return result.rows[0];
      },
    },

    supervisorIncidents: {
      async list(
        tenantId: string,
        supervisorUserId: string,
        filters: SupervisorIncidentFilters = {},
        includeAllUsers = false,
      ): Promise<SupervisorIncidentRow[]> {
        const rows = includeAllUsers
          ? await db.query<SupervisorIncidentRow>(
              `
              SELECT
                i.id,
                i.tenant_id,
                i.user_id,
                i.zone_id,
                i.incident_type,
                i.occurred_at,
                i.status,
                i.metadata_json,
                i.created_at,
                z.label AS zone_label
              FROM incidents i
              INNER JOIN exclusion_zones z
                ON z.tenant_id = i.tenant_id
               AND z.id = i.zone_id
              WHERE i.tenant_id = $1
              ORDER BY i.occurred_at DESC
            `,
              [tenantId],
            )
          : await db.query<SupervisorIncidentRow>(
              `
              SELECT
                i.id,
                i.tenant_id,
                i.user_id,
                i.zone_id,
                i.incident_type,
                i.occurred_at,
                i.status,
                i.metadata_json,
                i.created_at,
                z.label AS zone_label
              FROM incidents i
              INNER JOIN exclusion_zones z
                ON z.tenant_id = i.tenant_id
               AND z.id = i.zone_id
              INNER JOIN supervisor_assignments sa
                ON sa.tenant_id = i.tenant_id
               AND sa.supervisor_user_id = $2
               AND sa.assigned_user_id = i.user_id
              WHERE i.tenant_id = $1
              ORDER BY i.occurred_at DESC
            `,
              [tenantId, supervisorUserId],
            );

        return rows.rows.filter((row) => {
          if (filters.userId && row.user_id !== filters.userId) {
            return false;
          }
          if (filters.zoneId && row.zone_id !== filters.zoneId) {
            return false;
          }
          if (filters.status && row.status !== filters.status) {
            return false;
          }
          if (filters.type && row.incident_type !== filters.type) {
            return false;
          }
          return true;
        });
      },
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
