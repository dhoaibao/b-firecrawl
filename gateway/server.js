const http = require("node:http");
const { createAuditStore } = require("./audit-store");
const { renderAdmin } = require("./admin-ui");
const { config } = require("./config");
const { createProxyHandler } = require("./proxy");
const { writeJson } = require("./utils");

const auditStore = createAuditStore(config.logFile);
const handleProxy = createProxyHandler({ config, auditStore });

async function handleRequest(req, res) {
  try {
    const parsed = new URL(req.url, "http://gateway.local");
    if (req.method === "GET" && parsed.pathname === "/healthz") {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && parsed.pathname === "/admin") {
      await renderAdmin(res, req.url, auditStore);
      return;
    }

    if (req.method === "GET" && parsed.pathname === "/admin/logs") {
      writeJson(res, 200, { data: await auditStore.readAuditEntries(500) });
      return;
    }

    if (!/^\/v\d+\//.test(parsed.pathname)) {
      writeJson(res, 404, {
        success: false,
        error: "Only /v1/*, /v2/*, /healthz, and /admin are handled.",
      });
      return;
    }

    await handleProxy(req, res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    writeJson(res, statusCode, {
      success: false,
      error: error.message || "Gateway error",
    });
  }
}

http.createServer(handleRequest).listen(config.port, "0.0.0.0", () => {
  console.log(
    `Hybrid Firecrawl Gateway listening on :${config.port} (local=${config.localBaseUrl}, cloud=${config.cloudBaseUrl}, default=${config.defaultRouteMode})`,
  );
});
