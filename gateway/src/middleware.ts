import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 300;

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    const message = `${req.method} ${req.originalUrl || req.url} ${status} - ${duration}ms`;

    if (level === "error") {
      console.error(message);
    } else if (level === "warn") {
      console.warn(message);
    } else {
      console.log(message);
    }
  });

  next();
}

export function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (entry && now > entry.resetTime) {
    rateLimitStore.delete(ip);
  }

  const current = rateLimitStore.get(ip);
  const count = current ? current.count + 1 : 1;
  const resetTime = current ? current.resetTime : now + RATE_LIMIT_WINDOW_MS;

  if (count > RATE_LIMIT_MAX) {
    res.status(429).json({
      success: false,
      error: "Too many requests. Please try again later.",
    });
    return;
  }

  rateLimitStore.set(ip, { count, resetTime });
  res.setHeader("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, RATE_LIMIT_MAX - count)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)));
  next();
}
