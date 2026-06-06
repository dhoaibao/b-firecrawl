import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "node:path";
import { config } from "./config";
import { createAuditStore } from "./audit-store";
import { createProxyHandler } from "./proxy";
import { createAdminRouter } from "./admin-api";

const app = express();
const auditStore = createAuditStore(config.logFile);
const handleProxy = createProxyHandler({ config, auditStore });
const adminRouter = createAdminRouter(auditStore);

app.use(helmet());
app.use(cors());
app.use(compression());

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.use("/admin/api", adminRouter);
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

// Fallback to index.html for SPA routes (but not for /admin/api)
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(adminUiPath, "index.html"));
});
app.get("/admin/*", (req, res, next) => {
  if (req.path.startsWith("/admin/api")) {
    return next();
  }
  res.sendFile(path.join(adminUiPath, "index.html"));
});

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
  const statusCode = (err as Error & { statusCode?: number }).statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || "Gateway error",
  });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(
    `Hybrid Firecrawl Gateway listening on :${config.port} (local=${config.localBaseUrl}, cloud=${config.cloudBaseUrl}, default=${config.defaultRouteMode})`,
  );
});
