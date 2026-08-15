import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./guards";
import { SessionService } from "./session.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [SessionService, AuthGuard],
  exports: [SessionService, AuthGuard],
})
export class AuthModule {}
