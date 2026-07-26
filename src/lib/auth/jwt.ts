/**
 * Stateless session tokens.
 *
 * The monorepo used Auth.js (next-auth) with JWT sessions in an httpOnly
 * cookie. With the frontend on a separate origin, the simplest robust contract
 * is a signed bearer token: the frontend stores it and sends
 * `Authorization: Bearer <token>` on every call. Same signing model (HS256,
 * AUTH_SECRET), same 30-day lifetime Auth.js defaulted to.
 */
import jwt from "jsonwebtoken";

const SESSION_TTL = "30d";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export function signSession(userId: string): string {
  return jwt.sign({}, secret(), { subject: userId, expiresIn: SESSION_TTL });
}

/** Returns the userId or null — never throws on a bad/expired token. */
export function verifySession(token: string): string | null {
  try {
    const payload = jwt.verify(token, secret());
    if (typeof payload === "string" || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
