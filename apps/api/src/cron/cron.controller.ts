import { Controller, Get, Headers, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { CronService } from "./cron.service";

@Controller("api/cron")
export class CronController {
  constructor(private readonly cron: CronService) {}

  @Get("maintenance")
  async maintenance(
    @Headers("authorization") authorization: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    if (!this.cron.isAuthorized(authorization))
      return reply.code(401).send({ success: false, error: "Unauthorized" });
    return reply.send({ success: true, data: await this.cron.runMaintenance() });
  }
}
