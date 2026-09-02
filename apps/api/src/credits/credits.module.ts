import { Global, Module } from "@nestjs/common";
import { createClient } from "redis";
import { API_CONFIG } from "../common/config.provider";
import type { ApiConfig } from "../common/config";
import { CreditRoutingService } from "./credit-routing.service";
import {
  REDIS_CLIENT,
  RedisCreditLedgerStore,
  type RedisCommandClient,
} from "./credit-ledger.store";

const redisClientProvider = {
  provide: REDIS_CLIENT,
  inject: [API_CONFIG],
  useFactory: (config: ApiConfig): RedisCommandClient | null => {
    if (!config.redisUrl) return null;
    const client = createClient({
      url: config.redisUrl,
      socket: { connectTimeout: 750, reconnectStrategy: false },
    });
    // The store handles command failures and local fallback. Consume the
    // client's event so a refused/outage connection never becomes an
    // unhandled EventEmitter error.
    client.on("error", () => undefined);
    return client as unknown as RedisCommandClient;
  },
};

@Global()
@Module({
  providers: [redisClientProvider, RedisCreditLedgerStore, CreditRoutingService],
  exports: [CreditRoutingService],
})
export class CreditsModule {}
