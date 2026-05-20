import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

/**
 * Accepts Bearer token auth as a fallback to session cookies.
 * The token is the raw session ID returned by express-session.
 * We look it up directly in the PostgreSQL session table.
 */
export async function tokenAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // If session already has a userId from the cookie, skip
  if (req.session?.userId) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }

  const sid = authHeader.slice(7).trim();
  if (!sid) {
    next();
    return;
  }

  try {
    const result = await pool.query<{ sess: { userId?: number } }>(
      `SELECT sess FROM session WHERE sid = $1 AND expire > NOW()`,
      [sid]
    );
    const row = result.rows[0];
    if (row?.sess?.userId) {
      req.session.userId = row.sess.userId;
    }
  } catch {
    // Session lookup failed — proceed without auth
  }

  next();
}
