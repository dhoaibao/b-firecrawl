import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import { API_CONFIG } from "../common/config.provider";
import type { ApiConfig } from "../common/config";
import type { RequestWithContext } from "../common/types";
import { SessionService } from "../auth/session.service";
import { ProxyService } from "./proxy.service";

@Injectable()
export class ProxyRoutes implements OnModuleInit {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly proxy: ProxyService,
    private readonly sessions: SessionService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  onModuleInit(): void {
    const fastify = this.adapterHost.httpAdapter.getInstance();
    fastify.all("/v1/*", (request: FastifyRequest, reply: FastifyReply) => this.proxy.handle(request as RequestWithContext, reply));
    fastify.all("/v2/*", (request: FastifyRequest, reply: FastifyReply) => this.proxy.handle(request as RequestWithContext, reply));
    fastify.all("/admin/api/playground/v1/*", (request: FastifyRequest, reply: FastifyReply) => this.playground(request, reply));
    fastify.all("/admin/api/playground/v2/*", (request: FastifyRequest, reply: FastifyReply) => this.playground(request, reply));
  }

  private async playground(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!this.config.authEnabled) { await reply.code(404).send({ success: false, error: "Admin API is unavailable when AUTH_ENABLED=false." }); return; }
    const admin = this.sessions.getAdmin(request);
    if (!admin) { await reply.code(401).send({ success: false, error: "Unauthorized" }); return; }
    const typedRequest = request as RequestWithContext;
    typedRequest.admin = admin;
    const url = (request.raw.url || request.url).replace(/^\/admin\/api\/playground/, "") || "/";
    await this.proxy.handle(typedRequest, reply, url);
  }
}
