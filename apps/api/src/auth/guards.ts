import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { API_CONFIG } from "../common/config.provider";
import type { ApiConfig } from "../common/config";
import type { RequestWithContext } from "../common/types";
import { SessionService } from "./session.service";

function deny(reply: FastifyReply, status: number, error: string): false {
  void reply.code(status).send({ success: false, error });
  return false;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    if (!this.config.authEnabled) return deny(reply, 404, "Admin API is unavailable when AUTH_ENABLED=false.");
    const admin = this.sessions.getAdmin(request);
    if (!admin) return deny(reply, 401, "Unauthorized");
    request.admin = admin;
    return true;
  }
}
