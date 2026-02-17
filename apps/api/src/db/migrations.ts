import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@recovery/shared-utils";
import type { DbClient } from "./client";

const logger = createLogger("api");

const MIGRATION_TABLE = "schema_migrations";

function defaultMigrationsDir() {
  return path.resolve(__dirname, "..", "..", "migrations");
}

export async function runMigrations(db: DbClient, migrationsDir = defaultMigrationsDir()) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const existing = await db.query<{ name: string }>(
      `SELECT name FROM ${MIGRATION_TABLE} WHERE name = $1`,
      [file],
    );
    if (existing.rowCount) {
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    await db.query(sql);
    await db.query(`INSERT INTO ${MIGRATION_TABLE} (name) VALUES ($1)`, [file]);
    logger.info("db.migration.applied", { migration: file });
  }
}
