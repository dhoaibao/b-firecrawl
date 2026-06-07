import type { Request, Response, NextFunction } from "express";
import type { User } from "../types";

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const user = req.user as User | undefined;
  if (!user?.is_admin) {
    res.status(403).json({ success: false, error: "Forbidden" });
    return;
  }
  next();
}
