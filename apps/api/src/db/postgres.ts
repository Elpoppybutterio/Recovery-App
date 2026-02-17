import type { DbPool } from "./client";

type PgPoolOptions = {
  connectionString: string;
};

interface PgPool {
  query: DbPool["query"];
  end: NonNullable<DbPool["end"]>;
}

interface PgModule {
  Pool: new (options: PgPoolOptions) => PgPool;
}

function loadPgModule(): PgModule {
  try {
    // Runtime dynamic import keeps tests lightweight when a DB pool is injected.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("pg") as PgModule;
  } catch {
    throw new Error("Missing postgres driver. Install it with: pnpm --filter @recovery/api add pg");
  }
}

export function createPostgresPool(connectionString: string): DbPool {
  const { Pool } = loadPgModule();
  return new Pool({ connectionString });
}
