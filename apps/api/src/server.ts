import { createLogger } from "@recovery/shared-utils";
import { buildApp } from "./app";
import { loadApiEnv } from "./env";
import { seedDevUsers } from "./scripts/seed-dev";

const logger = createLogger("api");

async function startServer() {
  const env = loadApiEnv();
  const shouldSeed = process.env.DEV_SEED !== "false";

  if (process.env.NODE_ENV !== "production" && shouldSeed) {
    await seedDevUsers(env);
  }

  const app = buildApp({ env });

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  logger.info("server.started", { host: env.API_HOST, port: env.API_PORT });
}

startServer().catch((error) => {
  logger.error("server.failed", { error: error instanceof Error ? error.message : "unknown" });
  process.exit(1);
});
