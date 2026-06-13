import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "node:path";
import type { Socket } from "node:net";
import bcrypt from "bcrypt";
import { config } from "./config";
import { initDatabase, pingDatabase, getPool } from "./db";
import { bootstrapAdminUser } from "./db/bootstrap";
import { createAuditStore } from "./audit-store";
import { createProxyHandler } from "./proxy";
import { createAdminRouter } from "./admin-api";
import { requestLogger, rateLimiter, requestIdMiddleware } from "./middleware";
import { createSessionMiddleware } from "./auth/session";
import { passport } from "./auth/passport";
import { createAuthRouter } from "./auth/routes";
import { requireAuth, requireAdmin } from "./auth/middleware";
import { createUsersRouter } from "./users/routes";
import { createApiKeysRouter } from "./api-keys/routes";
import { createSettingsRouter } from "./settings/routes";
import { startBackgroundJobs } from "./jobs";
import { rootLogger } from "./logger";

async function main() {
  // Initialize database
  await initDatabase(config.databaseUrl);

  // Bootstrap admin user if auth is enabled and credentials are configured
  if (config.authEnabled && config.adminEmail && config.adminPassword) {
    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const adminHash = await bcrypt.hash(config.adminPassword, rounds);
    await bootstrapAdminUser(config.adminEmail, "Admin", adminHash);
  }

  const app = express();
  const auditStore = createAuditStore(config.logFile);
  const handleProxy = createProxyHandler({ config, auditStore });
  const adminRouter = createAdminRouter(auditStore);

  app.set("trust proxy", false);

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  }));
  app.use(compression());

  // Health endpoints — minimal middleware, no logging/rate limiting
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/ready", async (_req, res) => {
    const dbOk = await pingDatabase();
    if (dbOk) {
      res.json({ status: "ready", checks: { database: "ok" } });
    } else {
      res.status(503).json({
        status: "not_ready",
        checks: { database: "error" },
      });
    }
  });

  // Observability middleware
  app.use(requestIdMiddleware);

  // Session and auth
  if (config.authEnabled) {
    app.use(createSessionMiddleware(config.sessionSecret));
    app.use(passport.initialize());
    app.use(passport.session());
  }

  app.use(requestLogger);
  app.use(rateLimiter);

  // Auth routes (public)
  if (config.authEnabled) {
    app.use("/admin/api/auth", express.json(), createAuthRouter());
  }

  // Admin routes
  if (config.authEnabled) {
    app.use("/admin/api", requireAuth, adminRouter);
    app.use("/admin/api/users", express.json(), requireAdmin, createUsersRouter());
    app.use("/admin/api/api-keys", express.json(), requireAuth, createApiKeysRouter());
    app.use("/admin/api/settings", express.json(), requireAdmin, createSettingsRouter());
  } else {
    app.use("/admin/api", adminRouter);
    app.use("/admin/api/settings", express.json(), createSettingsRouter());
  }

  // Serve static files from admin-ui dist
  const adminUiPath = path.join(__dirname, "../admin-ui/dist");
  app.use("/admin", express.static(adminUiPath));

  // Fallback to index.html for SPA routes
  app.get("/admin", (_req, res) => {
    res.sendFile(path.join(adminUiPath, "index.html"));
  });
  app.get("/admin/*", (req, res, next) => {
    if (req.path.startsWith("/admin/api/") || req.path === "/admin/api") {
      return next();
    }
    res.sendFile(path.join(adminUiPath, "index.html"));
  });

  // Proxy routes
  app.use(async (req, res, next) => {
    if (!/^\/v[12]\//.test(req.path)) {
      return next();
    }
    try {
      await handleProxy(req, res);
    } catch (error) {
      next(error);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: "Only /v1/*, /v2/*, /health, /ready, and /admin are handled.",
    });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    rootLogger.error({ err }, "Gateway error");
    if (res.headersSent) {
      return;
    }
    const isDev = process.env.NODE_ENV !== "production";
    const statusCode = (err as Error & { statusCode?: number }).statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || "Gateway error",
      ...(isDev ? { stack: err.stack } : {}),
    });
  });

  // Start background jobs
  const stopJobs = startBackgroundJobs();

  const server = app.listen(config.port, "0.0.0.0", () => {
    rootLogger.info(
      {
        port: config.port,
        local: config.localBaseUrl,
        cloud: config.cloudBaseUrl,
        mode: config.defaultRouteMode,
        auth: config.authEnabled,
      },
      "Hybrid Firecrawl Gateway started",
    );
  });

  // Graceful shutdown
  const connections = new Set<Socket>();

  server.on("connection", (connection: Socket) => {
    connections.add(connection);
    connection.on("close", () => {
      connections.delete(connection);
    });
  });

  async function gracefulShutdown(signal: string): Promise<void> {
    rootLogger.info({ signal }, "Shutting down gracefully");

    stopJobs();

    server.close(async (err) => {
      if (err) {
        rootLogger.error({ err }, "Error closing server");
        process.exit(1);
      }
      rootLogger.info("HTTP server closed");

      try {
        await getPool().end();
        rootLogger.info("Database pool closed");
      } catch (poolErr) {
        rootLogger.error({ err: poolErr }, "Error closing database pool");
      }

      process.exit(0);
    });

    setTimeout(() => {
      rootLogger.warn("Forcing remaining connections closed");
      for (const connection of connections) {
        connection.destroy();
      }
    }, 10_000);

    setTimeout(() => {
      rootLogger.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, 15_000);
  }

  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    rootLogger.error({ err }, "Uncaught Exception");
    process.exitCode = 1;
    void gracefulShutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    rootLogger.error({ reason }, "Unhandled Rejection");
    process.exitCode = 1;
    void gracefulShutdown("unhandledRejection");
  });
}

void main();
