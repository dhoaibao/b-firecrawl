import { Router } from "express";
import type { ApiKey, User } from "../types";
import * as apiKeyService from "./service";

export function createApiKeysRouter() {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const user = req.user as User;
      const requestedUserId = req.query.user_id as string | undefined;
      
      // Only admins can query other users' keys
      const userId = (requestedUserId && user.is_admin) ? requestedUserId : user.id;
      const keys = await apiKeyService.listApiKeys(userId);
      res.json({ data: keys.map(sanitizeApiKey) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const user = req.user as User;
      const key = await apiKeyService.getApiKeyById(req.params.id);
      if (!key) {
        res.status(404).json({ success: false, error: "API key not found" });
        return;
      }
      // Only admins or key owner can view
      if (!user.is_admin && key.user_id !== user.id) {
        res.status(403).json({ success: false, error: "Forbidden" });
        return;
      }
      res.json({ data: sanitizeApiKey(key) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const user = req.user as User;
      const { user_id, name } = req.body;
      
      if (!name) {
        res.status(400).json({ success: false, error: "name is required" });
        return;
      }

      // Only admins can create keys for other users
      const targetUserId = user_id && user.is_admin ? user_id : user.id;
      const created = await apiKeyService.createApiKey(targetUserId, name);
      res.status(201).json({ data: created });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const user = req.user as User;
      const key = await apiKeyService.getApiKeyById(req.params.id);
      if (!key) {
        res.status(404).json({ success: false, error: "API key not found" });
        return;
      }
      // Only admins or key owner can revoke
      if (!user.is_admin && key.user_id !== user.id) {
        res.status(403).json({ success: false, error: "Forbidden" });
        return;
      }
      const revoked = await apiKeyService.revokeApiKey(req.params.id);
      res.json({ data: sanitizeApiKey(revoked!) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function sanitizeApiKey(key: ApiKey) {
  const { key_hash, ...rest } = key;
  return rest;
}
