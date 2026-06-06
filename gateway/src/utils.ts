export function nowIso(): string {
  return new Date().toISOString();
}

export function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function writeJson(
  res: { writeHead: (status: number, headers: Record<string, string>) => void; end: (body: Buffer) => void },
  statusCode: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.length),
    ...extraHeaders,
  });
  res.end(body);
}

export function walk(value: unknown, visit: (value: unknown) => void): void {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) walk(item, visit);
  }
}

export function findObjectsByKey(value: unknown, key: string): unknown[] {
  const found: unknown[] = [];
  walk(value, (current: unknown) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        found.push((current as Record<string, unknown>)[key]);
      }
    }
  });
  return found;
}

export function inspectBody(
  bodyBuffer: Buffer,
  headers: Record<string, string | string[] | undefined>,
): { json: unknown | null; parseError: string | null } {
  const contentType = String(headers["content-type"] || "");
  if (!bodyBuffer.length || !contentType.includes("application/json")) {
    return { json: null, parseError: null };
  }

  try {
    return { json: JSON.parse(bodyBuffer.toString("utf8")), parseError: null };
  } catch (error) {
    return { json: null, parseError: (error as Error).message };
  }
}

export function collectTargetUrls(jsonBody: unknown): string[] {
  const urls: string[] = [];
  walk(jsonBody, (value: unknown) => {
    if (typeof value !== "string") return;
    if (/^https?:\/\//i.test(value)) urls.push(value);
  });
  return [...new Set(urls)];
}

function isPrivateHostname(hostname: string): boolean {
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

export function hasPrivateTargetUrl(urls: string[]): boolean {
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

export function cryptoRandomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
