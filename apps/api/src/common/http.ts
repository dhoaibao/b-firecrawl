import { HttpException } from "@nestjs/common";

export function apiError(status: number, error: string): never {
  throw new HttpException({ success: false, error }, status);
}
