import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { apiError } from "../common/http";
import { AuthGuard } from "../auth/guards";
import { ApiKeysService, type ApiKeyRecord } from "./api-keys.service";

function sanitizeKey(key: ApiKeyRecord & { key?: unknown }) {
  const { key: _key, key_hash: _keyHash, key_value: _keyValue, ...rest } = key;
  return rest;
}

@Controller("admin/api/api-keys")
@UseGuards(AuthGuard)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  async list() {
    const keys = await this.keys.listApiKeys();
    return { data: keys.map(sanitizeKey) };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const key = await this.keys.getApiKeyById(id);
    if (!key) apiError(404, "API key not found");
    return { data: sanitizeKey(key) };
  }

  @Post()
  async create(@Body() body: { name?: unknown }) {
    if (typeof body.name !== "string" || !body.name) apiError(400, "name is required");
    return { data: await this.keys.createApiKey(body.name) };
  }

  @Delete(":id")
  async revoke(@Param("id") id: string) {
    const revoked = await this.keys.revokeApiKey(id);
    if (!revoked) apiError(404, "API key not found");
    return { data: sanitizeKey(revoked) };
  }
}
