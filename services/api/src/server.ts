import { createApp } from "./app.js";
import { ConfigurationError, loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = createApp(config);
  const shutdown = async () => {
    try {
      await app.close();
    } catch (error) {
      app.log.error({ err: error }, "Shutdown failed");
      process.exitCode = 1;
    }
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (error) {
    app.log.error("API startup failed; check server and database configuration");
    await app.close();
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigurationError ? error.message : "API startup failed");
  process.exitCode = 1;
});
