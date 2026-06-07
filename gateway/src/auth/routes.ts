import { Router } from "express";
import { passport } from "./passport";
import { requireAuth } from "./middleware";
import type { AuthenticatedRequest } from "./middleware";

export function createAuthRouter() {
  const router = Router();

  router.post("/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: Express.User | false, info: { message?: string }) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ success: false, error: info?.message || "Invalid credentials" });
      }
      req.session.regenerate((err) => {
        if (err) {
          return next(err);
        }
        req.logIn(user, (err) => {
          if (err) {
            return next(err);
          }
          req.session.save((err) => {
            if (err) {
              return next(err);
            }
            const { password_hash, ...safeUser } = user as unknown as Record<string, unknown>;
            res.json({ success: true, data: safeUser });
          });
        });
      });
    })(req, res, next);
  });

  router.post("/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) {
        return next(err);
      }
      req.session.destroy((err) => {
        if (err) {
          return next(err);
        }
        res.clearCookie("firecrawl.sid");
        res.json({ success: true });
      });
    });
  });

  router.get("/me", requireAuth, (req: AuthenticatedRequest, res) => {
    const { password_hash, ...safeUser } = req.user as unknown as Record<string, unknown>;
    res.json({ data: safeUser });
  });

  return router;
}
