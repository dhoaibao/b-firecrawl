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
}

export interface ProxyResult {
  kind: "response" | "network-error";
  backend: string;
  response?: Response;
  error?: Error;
  body: Buffer;
  durationMs: number;
}

export interface GatewayConfig {
  port: number;
  localBaseUrl: string;
  cloudBaseUrl: string;
  cloudApiKey: string;
  defaultRouteMode: string;
  requestTimeoutMs: number;
  logFile: string;
  maxBodyBytes: number;
}

export interface PrivacyCheck {
  hasSensitiveHeaders: boolean;
  hasPrivateTargetUrl: boolean;
}

export interface NeedsCloudResult {
  required: boolean;
  reason: string;
}
