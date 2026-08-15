import { Global, Module } from "@nestjs/common";
import { apiConfigProvider } from "./config.provider";

@Global()
@Module({ providers: [apiConfigProvider], exports: [apiConfigProvider] })
export class ApiConfigModule {}
