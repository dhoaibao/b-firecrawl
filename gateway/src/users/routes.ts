import { Router } from "express";
import bcrypt from "bcrypt";
import type { User } from "../types";
import * as userService from "./service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function getBcryptRounds(): number {
  return Number(process.env.BCRYPT_ROUNDS || 12);
}

export function createUsersRouter() {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const users = await userService.listUsers();
      res.json({ data: users.map(sanitizeUser) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const user = await userService.getUserById(req.params.id);
      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }
      res.json({ data: sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const { email, name, password, is_admin } = req.body;
      if (!email || !name || !password) {
        res.status(400).json({ success: false, error: "Email, name, and password are required" });
        return;
      }

      if (!EMAIL_REGEX.test(email)) {
        res.status(400).json({ success: false, error: "Invalid email format" });
        return;
      }

      if (password.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        return;
      }

      const existing = await userService.getUserByEmail(email);
      if (existing) {
        res.status(409).json({ success: false, error: "User with this email already exists" });
        return;
      }

      const passwordHash = await bcrypt.hash(password, getBcryptRounds());
      const user = await userService.createUser(email, name, passwordHash, is_admin === true);
      res.status(201).json({ data: sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const updates: { name?: string; email?: string; password_hash?: string; is_admin?: boolean } = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.email !== undefined) updates.email = req.body.email;
      if (req.body.password !== undefined) {
        if (req.body.password.length < MIN_PASSWORD_LENGTH) {
          res.status(400).json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
          return;
        }
        updates.password_hash = await bcrypt.hash(req.body.password, getBcryptRounds());
      }
      if (req.body.is_admin !== undefined) updates.is_admin = req.body.is_admin;

      const user = await userService.updateUser(req.params.id, updates);
      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }
      res.json({ data: sanitizeUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const deleted = await userService.deleteUser(req.params.id);
      if (!deleted) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function sanitizeUser(user: User) {
  const { password_hash, ...rest } = user;
  return rest;
}
