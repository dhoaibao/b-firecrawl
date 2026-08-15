import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { CronController } from "./cron.controller";
import { CronService } from "./cron.service";

@Module({ imports: [SettingsModule], controllers: [CronController], providers: [CronService] })
export class CronModule {}
