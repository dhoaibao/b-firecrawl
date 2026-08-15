import { Injectable, Inject, type NestMiddleware } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { API_CONFIG } from "./config.provider";
import type { ApiConfig } from "./config";
import { PrismaService } from "../prisma/prisma.service";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 300;

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService, @Inject(API_CONFIG) private readonly config: ApiConfig) {}

  async use(request: FastifyRequest, reply: FastifyReply, next: () => void): Promise<void> {
    if (request.url === "/health" || request.url === "/ready") return next();
    const ip = request.ip || request.raw.socket.remoteAddress || "unknown";
    try {
      const rows = await this.prisma.$queryRaw<Array<{ count: number; reset_at: Date }>>(Prisma.sql`
        INSERT INTO rate_limits (key, count, reset_at)
        VALUES (${ip}, 1, NOW() + interval '1 minute')
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN rate_limits.reset_at <= NOW() THEN 1 ELSE rate_limits.count + 1 END,
          reset_at = CASE WHEN rate_limits.reset_at <= NOW() THEN NOW() + interval '1 minute' ELSE rate_limits.reset_at END
        RETURNING count, reset_at
      `);
      const entry = rows[0];
      if (!entry) return next();
      reply.header("X-RateLimit-Limit", String(MAX_REQUESTS));
      reply.header("X-RateLimit-Remaining", String(Math.max(0, MAX_REQUESTS - Number(entry.count))));
      reply.header("X-RateLimit-Reset", String(Math.ceil(new Date(entry.reset_at).getTime() / 1000)));
      if (Number(entry.count) > MAX_REQUESTS) {
        void reply.code(429).send({ success: false, error: "Too many requests. Please try again later." });
        return;
      }
    } catch {
      // A rate limiter outage must not turn a healthy gateway into a denial of service.
    }
    next();
  }
}
