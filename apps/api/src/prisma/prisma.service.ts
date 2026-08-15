import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { API_CONFIG } from "../common/config.provider";
import type { ApiConfig } from "../common/config";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    super({ datasources: { db: { url: config.databaseUrl } } });
  }

  async onModuleInit(): Promise<void> {
    // Prisma connects lazily on the first query so /health remains available
    // while /ready accurately reports database reachability.
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
