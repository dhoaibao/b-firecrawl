import { Global, Module } from "@nestjs/common";
import { ApiConfigModule } from "../common/config.module";
import { PrismaService } from "./prisma.service";

@Global()
@Module({ imports: [ApiConfigModule], providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
