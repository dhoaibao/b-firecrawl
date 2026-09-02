import { Inject, Injectable } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import { API_CONFIG } from "../common/config.provider";
import type { ApiConfig } from "../common/config";
import type { AdminIdentity } from "../common/types";

export const SESSION_COOKIE = "firecrawl.sid";

@Injectable()
export class SessionService {
  private readonly secret: string;

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {
    this.secret = config.sessionSecret || crypto.randomBytes(32).toString("hex");
  }

  getAdmin(request: FastifyRequest): AdminIdentity | null {
    const email = this.config.adminEmail.trim().toLowerCase();
    const signature = request.cookies?.[SESSION_COOKIE] ?? "";
    const expected = email ? this.sign(email) : "";
    if (
      !email ||
      !signature ||
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return null;
    return { email };
  }

  setAdmin(reply: FastifyReply): void {
    const email = this.config.adminEmail.trim().toLowerCase();
    reply.setCookie(SESSION_COOKIE, this.sign(email), {
      httpOnly: true,
      sameSite: this.cookieSecure() ? "none" : "lax",
      secure: this.cookieSecure(),
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });
  }

  clearAdmin(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  private sign(value: string): string {
    return crypto.createHmac("sha256", this.secret).update(value).digest("base64url");
  }

  private cookieSecure(): boolean {
    const raw = process.env.SESSION_SECURE?.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(raw ?? "")) return false;
    if (["true", "1", "yes", "on"].includes(raw ?? "")) return true;
    return process.env.NODE_ENV === "production";
  }
}
