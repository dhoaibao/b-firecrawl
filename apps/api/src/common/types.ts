import type { FastifyRequest } from "fastify";

export interface AdminIdentity {
  email: string;
}

export interface AuditEntry {
  id: string;
  created_at: string;
  method: string;
  path: string;
  route_mode: string;
  backend_used: string;
  fallback_used: boolean;
  fallback_reason: string;
  status_code: number;
  duration_ms: number;
  target_url: string;
  request_id?: string;
}

export interface ProxyResult {
  kind: "response" | "network-error";
  backend: string;
  response?: Response;
  error?: Error;
  body?: Buffer;
  stream?: ReadableStream<Uint8Array>;
  cleanup?: () => void;
  durationMs: number;
}

export interface RequestWithContext extends FastifyRequest {
  requestId: string;
  admin?: AdminIdentity;
  rawBody?: Buffer | string;
}

export interface NeedsCloudResult {
  required: boolean;
  reason: string;
}

export interface PrivacyCheck {
  hasSensitiveHeaders: boolean;
  hasPrivateTargetUrl: boolean;
}
