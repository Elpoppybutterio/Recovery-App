import { createLogger } from "@recovery/shared-utils";
import { createPostgresPool } from "../db/postgres";
import { loadApiEnv } from "../env";
import {
  buildGeocodeQuery,
  geocodeWithGoogleMaps,
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
  geo_status: "ok" | "missing" | "invalid" | "partial";
  geo_reason: string | null;
  geo_updated_at: string | null;
};

type MeetingGeoColumnFlags = {
  hasGeoStatus: boolean;
  hasGeoReason: boolean;
  hasGeoUpdatedAt: boolean;
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
  const googleMapsApiKey = parseArg("--googleApiKey") ?? env.GOOGLE_MAPS_API_KEY;
  const googleVerify = process.argv.includes("--googleVerify") || env.MEETING_GUIDE_GOOGLE_VERIFY;
  const shouldGoogleVerify =
    googleVerify && typeof googleMapsApiKey === "string" && googleMapsApiKey.trim().length > 0;
  if (googleVerify && !shouldGoogleVerify) {
    logger.warn("meeting_guide.geo_backfill.google_verify_disabled", {
      reason: "google_api_key_missing",
      hint: "Set GOOGLE_MAPS_API_KEY or pass --googleApiKey when using --googleVerify.",
    });
  }
  const dryRun = process.argv.includes("--dryRun");
  const reverifyOk = process.argv.includes("--reverifyOk");

  const staleCutoffMs = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  const pool = createPostgresPool(env.DATABASE_URL);
  const geocodeCache = new Map<string, GeocodeResult>();
  const googleVerifyCache = new Map<string, GeocodeResult>();

  const columnFlagsResult = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'meeting_guide_meetings'
        AND column_name IN ('geo_status', 'geo_reason', 'geo_updated_at')
    `,
  );
  const columnSet = new Set(columnFlagsResult.rows.map((row) => row.column_name));
  const columnFlags: MeetingGeoColumnFlags = {
    hasGeoStatus: columnSet.has("geo_status"),
    hasGeoReason: columnSet.has("geo_reason"),
    hasGeoUpdatedAt: columnSet.has("geo_updated_at"),
  };

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let geocodeAttempts = 0;
  let geocodeSuccess = 0;
  let geocodeFailed = 0;
  let googleVerifyAttempts = 0;
  let googleVerifySuccess = 0;
  let googleVerifyFailed = 0;

  logger.info("meeting_guide.geo_backfill.start", {
    tenantId,
    batchSize,
    rateLimitMs,
    maxRows,
    staleDays,
    dryRun,
    reverifyOk,
    googleVerify: shouldGoogleVerify,
    schema: columnFlags,
  });

  try {
    while (scanned < maxRows) {
      const remaining = maxRows - scanned;
      const limit = Math.min(batchSize, remaining);
      const selectGeoStatusExpr = columnFlags.hasGeoStatus
        ? "geo_status"
        : "CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 'ok' ELSE 'missing' END AS geo_status";
      const selectGeoReasonExpr = columnFlags.hasGeoReason
        ? "geo_reason"
        : "NULL::text AS geo_reason";
      const selectGeoUpdatedAtExpr = columnFlags.hasGeoUpdatedAt
        ? "geo_updated_at"
        : "NULL::timestamptz AS geo_updated_at";

      const stalePredicate = columnFlags.hasGeoUpdatedAt
        ? "OR geo_updated_at IS NULL OR geo_updated_at < $2::timestamptz"
        : "OR ($2::timestamptz IS NOT NULL AND FALSE)";
      const nonOkPredicate = columnFlags.hasGeoStatus ? "OR geo_status <> 'ok'" : "";
      const orderBy = columnFlags.hasGeoUpdatedAt
        ? "ORDER BY COALESCE(geo_updated_at, to_timestamp(0)) ASC, updated_at DESC"
        : "ORDER BY updated_at DESC";

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
          ${selectGeoStatusExpr},
          ${selectGeoReasonExpr},
          ${selectGeoUpdatedAtExpr}
        FROM meeting_guide_meetings
        WHERE tenant_id = $1
          AND (
            $4::boolean = TRUE
            ${nonOkPredicate}
            OR lat IS NULL
            OR lng IS NULL
            ${stalePredicate}
          )
        ${orderBy}
        LIMIT $3
      `,
        [tenantId, new Date(staleCutoffMs).toISOString(), limit, reverifyOk],
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

        if (resolved.geoStatus !== "ok" || reverifyOk) {
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
                  expectedAddressParts: normalizedAddress,
                });
              } catch {
                geocodeResult = {
                  coords: null,
                  reason: "provider_exception",
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
              if (shouldGoogleVerify) {
                let googleVerifiedResult = googleVerifyCache.get(geocodeQuery);
                if (googleVerifiedResult === undefined) {
                  googleVerifyAttempts += 1;
                  try {
                    googleVerifiedResult = await geocodeWithGoogleMaps({
                      query: geocodeQuery,
                      fetchImpl: (input, init) => fetch(input, init),
                      apiKey: googleMapsApiKey as string,
                      expectedAddressParts: normalizedAddress,
                    });
                  } catch {
                    googleVerifiedResult = {
                      coords: null,
                      reason: "provider_exception",
                    };
                  }
                  if (googleVerifiedResult.coords) {
                    googleVerifySuccess += 1;
                  } else {
                    googleVerifyFailed += 1;
                  }
                  googleVerifyCache.set(geocodeQuery, googleVerifiedResult);
                }

                if (googleVerifiedResult.coords) {
                  geocodeResult = googleVerifiedResult;
                } else {
                  const reason = googleVerifiedResult.reason ?? "no_trusted_results";
                  geocodeResult = {
                    coords: null,
                    reason: reason.startsWith("google_verify_")
                      ? reason
                      : `google_verify_${reason}`,
                  };
                }
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
              const contextMismatch = geocodeResult.reason?.includes("context_") ?? false;
              if (resolved.geoStatus === "ok" && contextMismatch) {
                resolved = {
                  lat: null,
                  lng: null,
                  geoStatus: "partial",
                  geoReason: fallbackReason ?? "geocode_context_mismatch",
                };
              } else {
                resolved = {
                  ...resolved,
                  geoReason: fallbackReason ?? resolved.geoReason,
                };
              }
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
          const values: unknown[] = [
            normalizedAddress.formattedAddress,
            normalizedAddress.address,
            normalizedAddress.city,
            normalizedAddress.state,
            normalizedAddress.postalCode,
            normalizedAddress.country,
            resolved.lat,
            resolved.lng,
          ];
          const assignments = [
            "formatted_address = $1",
            "address = $2",
            "city = $3",
            "state = $4",
            "postal_code = $5",
            "country = $6",
            "lat = $7",
            "lng = $8",
          ];

          if (columnFlags.hasGeoStatus) {
            assignments.push(`geo_status = $${values.length + 1}`);
            values.push(resolved.geoStatus);
          }
          if (columnFlags.hasGeoReason) {
            assignments.push(`geo_reason = $${values.length + 1}`);
            values.push(resolved.geoReason);
          }
          if (columnFlags.hasGeoUpdatedAt) {
            assignments.push(`geo_updated_at = $${values.length + 1}`);
            values.push(new Date().toISOString());
          }

          values.push(tenantId);
          values.push(row.id);
          const tenantIdParam = values.length - 1;
          const idParam = values.length;

          await pool.query(
            `
            UPDATE meeting_guide_meetings
            SET
              ${assignments.join(",\n              ")},
              updated_at = NOW()
            WHERE tenant_id = $${tenantIdParam}
              AND id = $${idParam}
          `,
            values,
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
    google_verify_attempts_total: googleVerifyAttempts,
    google_verify_success_total: googleVerifySuccess,
    google_verify_failed_total: googleVerifyFailed,
    dryRun,
  });
}

main().catch((error) => {
  logger.error("meeting_guide.geo_backfill.failed", {
    reason: error instanceof Error ? error.message : "unknown",
  });
  process.exit(1);
});
