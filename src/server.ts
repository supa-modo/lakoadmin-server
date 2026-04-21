import "./config/env"; // Load env first
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { connectRedis } from "./config/redis";
import { initQueues } from "./config/queues";
import { initS3 } from "./config/s3";
import { startWorkers, stopWorkers } from "./workers";
import app from "./app";

async function bootstrap(): Promise<void> {
  logger.info("Starting Lako Admin API Server...");

  // Connect to database
  await connectDatabase();

  // Connect to Redis (non-fatal)
  await connectRedis();

  // Initialize queues
  initQueues();

  // Initialize S3/Spaces
  initS3();

  // Start workers if enabled
  await startWorkers();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received – shutting down gracefully`);
    server.close(async () => {
      await stopWorkers();
      await disconnectDatabase();
      logger.info("Server shut down");
      process.exit(0);
    });

    // Force exit after 30 seconds
    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason });
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error("Failed to start server", { error: err.message });
  process.exit(1);
});
