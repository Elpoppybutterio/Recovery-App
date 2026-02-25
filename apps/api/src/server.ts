import { createLogger } from "@recovery/shared-utils";
import { buildApp } from "./app";
import { loadApiEnv } from "./env";
import { seedDevUsers } from "./scripts/seed-dev";

const logger = createLogger("api");

async function startServer() {
  const env = loadApiEnv();
  const host = env.API_HOST;
  const portFromRuntime = Number(process.env.PORT ?? env.API_PORT);
  const port = Number.isFinite(portFromRuntime) ? portFromRuntime : env.API_PORT;
  if (process.env.PORT !== undefined && !Number.isFinite(portFromRuntime)) {
    logger.warn("server.port.invalid_runtime_port_fallback", {
      receivedPort: process.env.PORT,
      fallbackPort: env.API_PORT,
    });
  }
  const shouldSeed = process.env.DEV_SEED !== "false";

  if (process.env.NODE_ENV !== "production" && shouldSeed) {
    await seedDevUsers(env);
  }

  const app = buildApp({ env });

  await app.listen({ host, port });
  logger.info("server.started", { host, port });
}

startServer().catch((error) => {
  logger.error("server.failed", { error: error instanceof Error ? error.message : "unknown" });
  process.exit(1);
});
