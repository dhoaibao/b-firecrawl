import { Controller, Get, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { PrismaService } from "../prisma/prisma.service";

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("health")
  health() { return { status: "ok" }; }

  @Get("ready")
  async ready(@Res() reply: FastifyReply) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: "ready", checks: { database: "ok" } });
    } catch {
      return reply.code(503).send({ status: "not_ready", checks: { database: "error" } });
    }
  }
}
