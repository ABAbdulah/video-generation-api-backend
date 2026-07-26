import type { NextFunction, Request, Response } from "express";
import { verifySession } from "@/lib/auth/jwt";

// Express's Request is augmented rather than wrapped so route handlers can
// stay plain (req, res) functions.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Populates req.userId when a valid bearer token is present. Never rejects. */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const userId = verifySession(header.slice("Bearer ".length));
    if (userId) req.userId = userId;
  }
  next();
}

/** 401s when attachUser found no valid session. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    res.status(401).json({ error: "You must be signed in." });
    return;
  }
  next();
}
