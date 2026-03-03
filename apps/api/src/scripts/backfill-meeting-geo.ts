import { createLogger } from "@recovery/shared-utils";
import { createPostgresPool } from "../db/postgres";
import { loadApiEnv } from "../env";
import {
  buildGeocodeQuery,
  geocodeWithOpenStreetMap,
  normalizeAddressParts,
  resolveMeetingGeoStatus,
  type GeocodeResult,
} from "../meeting-geo";

const logger = createLogger("api");

type MeetingGeoCandidateRow = {
  id: string;
  tenant_id: string;
  name: string;
  formatted_address: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  geo_status: "ok" | "missing" | "invalid" | "partial" | "needs_geocode";
  geo_reason: string | null;
  geo_updated_at: string | null;
};

function parseArg(name: string): string | null {
  const index = process.argv.findIndex((entry) => entry === name);
  if (index < 0) {
    return null;
  }
  const value = process.argv[index + 1];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseNumberArg(name: string, fallback: number): number {
  const raw = parseArg(name);
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  const env = loadApiEnv();
  const tenantId = parseArg("--tenantId") ?? env.MEETING_GUIDE_DEFAULT_TENANT_ID;
  if (!tenantId) {
    throw new Error(
      "Missing tenant id. Pass --tenantId <tenant-id> or set MEETING_GUIDE_DEFAULT_TENANT_ID.",
    );
  }

  const batchSize = Math.max(1, Math.min(500, Math.round(parseNumberArg("--batchSize", 100))));
  const rateLimitMs = Math.max(0, Math.round(parseNumberArg("--rateLimitMs", 1100)));
  const maxRows = Math.max(1, Math.round(parseNumberArg("--maxRows", 5000)));
  const staleDays = Math.max(1, Math.round(parseNumberArg("--staleDays", 30)));
  const userAgent =
    parseArg("--userAgent") ??
    env.MEETING_GUIDE_GEOCODE_USER_AGENT ??
    "Recovery-Accountability/0.1";
  const dryRun = process.argv.includes("--dryRun");

  const staleCutoffMs = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  const pool = createPostgresPool(env.DATABASE_URL);
  const geocodeCache = new Map<string, GeocodeResult>();

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let geocodeAttempts = 0;
  let geocodeSuccess = 0;
  let geocodeFailed = 0;

  logger.info("meeting_guide.geo_backfill.start", {
    tenantId,
    batchSize,
    rateLimitMs,
    maxRows,
    staleDays,
    dryRun,
  });

  try {
    while (scanned < maxRows) {
      const remaining = maxRows - scanned;
      const limit = Math.min(batchSize, remaining);
      const result = await pool.query<MeetingGeoCandidateRow>(
        `
        SELECT
          id,
          tenant_id,
          name,
          formatted_address,
          address,
          city,
          state,
          postal_code,
          country,
          lat,
          lng,
          geo_status,
          geo_reason,
          geo_updated_at
        FROM meeting_guide_meetings
        WHERE tenant_id = $1
          AND (
            geo_status <> 'ok'
            OR lat IS NULL
            OR lng IS NULL
            OR geo_updated_at IS NULL
            OR geo_updated_at < $2::timestamptz
          )
        ORDER BY COALESCE(geo_updated_at, to_timestamp(0)) ASC, updated_at DESC
        LIMIT $3
      `,
        [tenantId, new Date(staleCutoffMs).toISOString(), limit],
      );

      if (result.rows.length === 0) {
        break;
      }

      for (const row of result.rows) {
        scanned += 1;
        const normalizedAddress = normalizeAddressParts({
          formattedAddress: row.formatted_address,
          address: row.address,
          city: row.city,
          state: row.state,
          postalCode: row.postal_code,
          country: row.country,
        });

        let resolved = resolveMeetingGeoStatus({
          lat: row.lat,
          lng: row.lng,
          formattedAddress: normalizedAddress.formattedAddress,
        });

        if (resolved.geoStatus !== "ok") {
          const geocodeQuery = buildGeocodeQuery(normalizedAddress);
          if (geocodeQuery) {
            let geocodeResult = geocodeCache.get(geocodeQuery);
            if (!geocodeResult) {
              geocodeAttempts += 1;
              try {
                geocodeResult = await geocodeWithOpenStreetMap({
                  query: geocodeQuery,
                  fetchImpl: (input, init) => fetch(input, init),
                  userAgent,
                });
              } catch {
                geocodeResult = {
                  coords: null,
                  reason: "provider_exception",
                  source: "osm_nominatim",
                  confidence: null,
                };
              }
              geocodeCache.set(geocodeQuery, geocodeResult);
              if (geocodeResult.coords) {
                geocodeSuccess += 1;
              } else {
                geocodeFailed += 1;
              }
              if (rateLimitMs > 0) {
                await new Promise<void>((resolve) => {
                  setTimeout(resolve, rateLimitMs);
                });
              }
            }

            if (geocodeResult.coords) {
              resolved = resolveMeetingGeoStatus({
                lat: geocodeResult.coords.lat,
                lng: geocodeResult.coords.lng,
                formattedAddress: normalizedAddress.formattedAddress,
              });
            } else {
              const fallbackReason = geocodeResult.reason
                ? `geocode_${geocodeResult.reason}`
                : null;
              resolved = {
                ...resolved,
                geoReason: fallbackReason ?? resolved.geoReason,
              };
            }
          }
        }

        const unchangedGeo =
          row.lat === resolved.lat &&
          row.lng === resolved.lng &&
          row.geo_status === resolved.geoStatus &&
          (row.geo_reason ?? null) === (resolved.geoReason ?? null);

        if (unchangedGeo && !normalizedAddress.formattedAddress) {
          unchanged += 1;
          continue;
        }

        if (!dryRun) {
          await pool.query(
            `
            UPDATE meeting_guide_meetings
            SET
              formatted_address = $1,
              address = $2,
              city = $3,
              state = $4,
              postal_code = $5,
              country = $6,
              lat = $7,
              lng = $8,
              geo_status = $9,
              geo_reason = $10,
              geo_updated_at = $11,
              updated_at = NOW()
            WHERE tenant_id = $12
              AND id = $13
          `,
            [
              normalizedAddress.formattedAddress,
              normalizedAddress.address,
              normalizedAddress.city,
              normalizedAddress.state,
              normalizedAddress.postalCode,
              normalizedAddress.country,
              resolved.lat,
              resolved.lng,
              resolved.geoStatus,
              resolved.geoReason,
              new Date().toISOString(),
              tenantId,
              row.id,
            ],
          );
        }
        updated += 1;
      }
    }
  } finally {
    await pool.end?.();
  }

  logger.info("meeting_guide.geo_backfill.complete", {
    tenantId,
    scanned,
    updated,
    unchanged,
    geocode_attempts_total: geocodeAttempts,
    geocode_success_total: geocodeSuccess,
    geocode_failed_total: geocodeFailed,
    dryRun,
  });
}

main().catch((error) => {
  logger.error("meeting_guide.geo_backfill.failed", {
    reason: error instanceof Error ? error.message : "unknown",
  });
  process.exit(1);
});
