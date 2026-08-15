import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { AuthModule } from "../auth/auth.module";
import { SettingsModule } from "../settings/settings.module";
import { ProxyRoutes } from "./proxy.routes";
import { ProxyService } from "./proxy.service";

@Module({ imports: [AuditModule, ApiKeysModule, AuthModule, SettingsModule], providers: [ProxyService, ProxyRoutes] })
export class ProxyModule {}
