const { escapeHtml } = require("./utils");

async function renderAdmin(res, reqUrl, auditStore) {
  const parsed = new URL(reqUrl, "http://gateway.local");
  const backendFilter = parsed.searchParams.get("backend") || "";
  const statusFilter = parsed.searchParams.get("status") || "";
  const fallbackOnly = parsed.searchParams.get("fallback") === "1";
  const allEntries = await auditStore.readAuditEntries(500);
  const entries = allEntries.filter(entry => {
    if (backendFilter && entry.backend_used !== backendFilter) return false;
    if (fallbackOnly && !entry.fallback_used) return false;
    if (statusFilter === "2xx" && !isStatusRange(entry.status_code, 200)) return false;
    if (statusFilter === "4xx" && !isStatusRange(entry.status_code, 400)) return false;
    if (statusFilter === "5xx" && !isStatusRange(entry.status_code, 500)) return false;
    return true;
  });

  const totals = summarizeEntries(allEntries);
  const rows = entries.map(renderRow).join("");
  const html = renderHtml({
    allEntries,
    backendFilter,
    fallbackOnly,
    rows,
    statusFilter,
    totals,
  });

  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
  });
  res.end(html);
}

function renderRow(entry) {
  return `<tr>
    <td class="time">${escapeHtml(formatDisplayTime(entry.created_at))}</td>
    <td><span class="method">${escapeHtml(entry.method)}</span></td>
    <td class="path">${escapeHtml(entry.path)}</td>
    <td><span class="badge neutral">${escapeHtml(entry.route_mode)}</span></td>
    <td>${backendBadge(entry.backend_used)}</td>
    <td>${entry.fallback_used ? '<span class="badge warn">fallback</span>' : '<span class="muted">no</span>'}</td>
    <td class="reason">${escapeHtml(entry.fallback_reason || "")}</td>
    <td>${statusBadge(entry.status_code)}</td>
    <td class="number">${escapeHtml(entry.duration_ms || "")}</td>
    <td class="target">${entry.target_url ? `<a href="${escapeHtml(entry.target_url)}" target="_blank" rel="noreferrer">${escapeHtml(entry.target_url)}</a>` : '<span class="muted">none</span>'}</td>
  </tr>`;
}

function renderHtml({
  allEntries,
  backendFilter,
  fallbackOnly,
  rows,
  statusFilter,
  totals,
}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hybrid Firecrawl Gateway</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f6f7f9;
      color: #121826;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f6f7f9; color: #121826; }
    main { max-width: 1440px; margin: 0 auto; padding: 24px; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    h1 { font-size: 24px; line-height: 1.2; margin: 0; }
    .subtitle { color: #64748b; margin: 6px 0 0; font-size: 14px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    a { color: #0f172a; }
    .button, .pill {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      border: 1px solid #d0d7e2;
      border-radius: 7px;
      padding: 7px 11px;
      background: white;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    .button.primary { background: #0f172a; color: white; border-color: #0f172a; }
    .summary {
      display: grid;
      grid-template-columns: repeat(5, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .metric {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
    }
    .metric-label { color: #64748b; font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: .04em; }
    .metric-value { font-size: 26px; font-weight: 750; margin-top: 6px; }
    .filters {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .filter-group { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .pill.active { background: #e2e8f0; border-color: #94a3b8; }
    .table-wrap {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: white;
      overflow: auto;
    }
    table { width: 100%; min-width: 1040px; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
    th { background: #f8fafc; font-weight: 700; color: #475569; position: sticky; top: 0; z-index: 1; }
    tr:last-child td { border-bottom: 0; }
    tr:hover td { background: #fafafa; }
    .time { white-space: nowrap; color: #475569; }
    .method { font-weight: 750; letter-spacing: .03em; }
    .path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; max-width: 220px; overflow-wrap: anywhere; }
    .target, .reason { max-width: 280px; overflow-wrap: anywhere; }
    .number { text-align: right; font-variant-numeric: tabular-nums; }
    .muted { color: #94a3b8; }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .badge.neutral { background: #f1f5f9; color: #334155; border-color: #e2e8f0; }
    .badge.local { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
    .badge.cloud { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    .badge.none { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
    .badge.warn { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
    .badge.ok { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
    .badge.bad { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
    .badge.mid { background: #fffbeb; color: #b45309; border-color: #fde68a; }
    .empty { background: white; border: 1px solid #e2e8f0; padding: 28px; border-radius: 8px; color: #64748b; }
    @media (max-width: 900px) {
      main { padding: 16px; }
      .header { display: block; }
      .actions { justify-content: flex-start; margin-top: 12px; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <main>
    <section class="header">
      <div>
        <h1>Hybrid Firecrawl Gateway</h1>
        <p class="subtitle">Last ${escapeHtml(allEntries.length)} requests routed through local Firecrawl and Firecrawl Cloud.</p>
      </div>
      <div class="actions">
        <a class="button" href="/admin">Refresh</a>
        <a class="button primary" href="/admin/logs">JSON logs</a>
      </div>
    </section>

    <section class="summary">
      <div class="metric"><div class="metric-label">Requests</div><div class="metric-value">${totals.total}</div></div>
      <div class="metric"><div class="metric-label">Local</div><div class="metric-value">${totals.local}</div></div>
      <div class="metric"><div class="metric-label">Cloud</div><div class="metric-value">${totals.cloud}</div></div>
      <div class="metric"><div class="metric-label">Fallbacks</div><div class="metric-value">${totals.fallbacks}</div></div>
      <div class="metric"><div class="metric-label">Avg ms</div><div class="metric-value">${totals.avgDuration}</div></div>
    </section>

    <div class="filters">
      <div class="filter-group">
        ${filterPill("All", "/admin", !backendFilter && !fallbackOnly && !statusFilter)}
        ${filterPill("Local", "/admin?backend=local", backendFilter === "local")}
        ${filterPill("Cloud", "/admin?backend=cloud", backendFilter === "cloud")}
        ${filterPill("Fallback only", "/admin?fallback=1", fallbackOnly)}
      </div>
      <div class="filter-group">
        ${filterPill("2xx", "/admin?status=2xx", statusFilter === "2xx")}
        ${filterPill("4xx", "/admin?status=4xx", statusFilter === "4xx")}
        ${filterPill("5xx", "/admin?status=5xx", statusFilter === "5xx")}
      </div>
    </div>
    ${
      rows
        ? `<div class="table-wrap"><table>
          <thead>
            <tr>
              <th>Time</th><th>Method</th><th>Path</th><th>Mode</th><th>Backend</th><th>Fallback</th><th>Reason</th><th>Status</th><th>ms</th><th>Target URL</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table></div>`
        : `<div class="empty">No gateway requests match the current filters.</div>`
    }
  </main>
</body>
</html>`;
}

function isStatusRange(statusCode, base) {
  const status = Number(statusCode);
  return status >= base && status < base + 100;
}

function summarizeEntries(entries) {
  const durations = entries
    .map(entry => Number(entry.duration_ms))
    .filter(value => Number.isFinite(value));
  const avgDuration = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;

  return {
    total: entries.length,
    local: entries.filter(entry => entry.backend_used === "local").length,
    cloud: entries.filter(entry => entry.backend_used === "cloud").length,
    fallbacks: entries.filter(entry => entry.fallback_used).length,
    avgDuration,
  };
}

function formatDisplayTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function filterPill(label, href, active) {
  return `<a class="pill${active ? " active" : ""}" href="${href}">${escapeHtml(label)}</a>`;
}

function backendBadge(backend) {
  const value = backend || "none";
  const cls = value === "local" ? "local" : value === "cloud" ? "cloud" : "none";
  return `<span class="badge ${cls}">${escapeHtml(value)}</span>`;
}

function statusBadge(statusCode) {
  const status = Number(statusCode);
  if (!Number.isFinite(status)) return '<span class="badge none">n/a</span>';
  const cls = status < 300 ? "ok" : status < 500 ? "mid" : "bad";
  return `<span class="badge ${cls}">${status}</span>`;
}

module.exports = { renderAdmin };
