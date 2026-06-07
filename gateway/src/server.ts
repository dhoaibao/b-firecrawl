import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "node:path";
import type { Socket } from "node:net";
import bcrypt from "bcrypt";
import { config } from "./config";
import { initDatabase } from "./db";
import { bootstrapAdminUser } from "./db/bootstrap";
import { createAuditStore } from "./audit-store";
import { createProxyHandler } from "./proxy";
import { createAdminRouter } from "./admin-api";
import { requestLogger, rateLimiter } from "./middleware";
import { createSessionMiddleware } from "./auth/session";
import { passport } from "./auth/passport";
import { createAuthRouter } from "./auth/routes";
import { requireAuth, requireAdmin } from "./auth/middleware";
import { createUsersRouter } from "./users/routes";
import { createApiKeysRouter } from "./api-keys/routes";

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

  // Trust proxy when behind a reverse proxy
  app.set("trust proxy", 1);

  // Security middleware
  app.use(helmet());
  app.use(cors());
  app.use(compression());

  // Session and auth
  if (config.authEnabled) {
    app.use(createSessionMiddleware(config.sessionSecret));
    app.use(passport.initialize());
    app.use(passport.session());
  }

  // Observability middleware
  app.use(requestLogger);
  app.use(rateLimiter);

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  // Auth routes (public)
  if (config.authEnabled) {
    app.use("/admin/api/auth", express.json(), createAuthRouter());
  }

  // Admin routes
  if (config.authEnabled) {
    app.use("/admin/api", requireAuth, adminRouter);
    app.use("/admin/api/users", express.json(), requireAdmin, createUsersRouter());
    app.use("/admin/api/api-keys", express.json(), requireAuth, createApiKeysRouter());
  } else {
    app.use("/admin/api", adminRouter);
  }

  app.get("/admin/logs", async (_req, res, next) => {
    try {
      const entries = await auditStore.readAuditEntries(500);
      res.json({ data: entries });
    } catch (error) {
      next(error);
    }
  });

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
      error: "Only /v1/*, /v2/*, /healthz, and /admin are handled.",
    });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Gateway error:", err);
    const isDev = process.env.NODE_ENV !== "production";
    const statusCode = (err as Error & { statusCode?: number }).statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || "Gateway error",
      ...(isDev ? { stack: err.stack } : {}),
    });
  });

  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(
      `Hybrid Firecrawl Gateway listening on :${config.port} (local=${config.localBaseUrl}, cloud=${config.cloudBaseUrl}, default=${config.defaultRouteMode}, auth=${config.authEnabled})`,
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
    console.log(`Received ${signal}, shutting down gracefully...`);

    server.close((err) => {
      if (err) {
        console.error("Error closing server:", err);
        process.exit(1);
      }
      console.log("HTTP server closed");
      process.exit(0);
    });

    setTimeout(() => {
      console.warn("Forcing remaining connections closed...");
      for (const connection of connections) {
        connection.destroy();
      }
    }, 10_000);

    setTimeout(() => {
      console.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, 15_000);
  }

  process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    void gracefulShutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
  });
}

void main();
