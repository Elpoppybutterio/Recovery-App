import { createLogger } from "@recovery/shared-utils";
import { runMigrations } from "../db/migrations";
import { createPostgresPool } from "../db/postgres";
import { loadApiEnv } from "../env";

const logger = createLogger("api");

async function main() {
  const env = loadApiEnv();
  const pool = createPostgresPool(env.DATABASE_URL);

  try {
    await runMigrations(pool);
    logger.info("db.migrations.complete", { migrationsDir: "apps/api/migrations" });
  } finally {
    await pool.end?.();
  }
}

main().catch((error) => {
  logger.error("db.migrations.failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  process.exit(1);
});
