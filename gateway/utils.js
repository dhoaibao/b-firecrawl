function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function writeJson(res, statusCode, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    ...extraHeaders,
  });
  res.end(body);
}

function walk(value, visit) {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) walk(item, visit);
  }
}

function findObjectsByKey(value, key) {
  const found = [];
  walk(value, current => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        found.push(current[key]);
      }
    }
  });
  return found;
}

function inspectBody(bodyBuffer, headers) {
  const contentType = String(headers["content-type"] || "");
  if (!bodyBuffer.length || !contentType.includes("application/json")) {
    return { json: null, parseError: null };
  }

  try {
    return { json: JSON.parse(bodyBuffer.toString("utf8")), parseError: null };
  } catch (error) {
    return { json: null, parseError: error.message };
  }
}

function collectTargetUrls(jsonBody) {
  const urls = [];
  walk(jsonBody, value => {
    if (typeof value !== "string") return;
    if (/^https?:\/\//i.test(value)) urls.push(value);
  });
  return [...new Set(urls)];
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") {
    return true;
  }

  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;

  const [, aRaw, bRaw] = ipv4;
  const a = Number(aRaw);
  const b = Number(bRaw);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function hasPrivateTargetUrl(urls) {
  for (const item of urls) {
    try {
      const parsed = new URL(item);
      if (isPrivateHostname(parsed.hostname)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  collectTargetUrls,
  cryptoRandomId,
  escapeHtml,
  findObjectsByKey,
  hasPrivateTargetUrl,
  inspectBody,
  nowIso,
  walk,
  writeJson,
};
