import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import crypto from "node:crypto";
import { getPool } from "../db";

export function createSessionMiddleware(sessionSecret: string) {
  const secret = sessionSecret || crypto.randomBytes(32).toString("hex");
  if (!sessionSecret) {
    console.warn("WARNING: SESSION_SECRET is not set. A random secret was generated. Sessions will not persist across restarts.");
  }

  const PgStore = connectPgSimple(session);

  return session({
    store: new PgStore({
      pool: getPool(),
      createTableIfMissing: true,
      tableName: "sessions",
    }),
    secret,
    resave: false,
    saveUninitialized: false,
    name: "firecrawl.sid",
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: process.env.SESSION_SECURE === "true",
      sameSite: "lax",
    },
  });
}
