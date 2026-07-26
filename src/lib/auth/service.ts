/**
 * Framework-agnostic auth operations. The Express routes in
 * src/routes/auth.ts are thin wrappers around these, and the tests call them
 * directly — same pattern as the generation handler.
 */
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { provisionNewUserTx } from "./provision";
import { signSession } from "./jwt";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export type AuthResult =
  | { status: number; body: { error: string } }
  | { status: number; body: { ok: true; token: string; user: AuthUser } };

const signupSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).optional(),
});

export async function signup(raw: unknown): Promise<AuthResult> {
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 400, body: { error: "Validation failed" } };
  }

  const email = parsed.data.email.toLowerCase();
  const { password, name } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    return {
      status: 409,
      body: { error: "An account with this email already exists" },
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // User + personal workspace + signup credit grant, atomically.
  const user = await db.transaction(async (tx) => {
    const [u] = await tx
      .insert(users)
      .values({ email, name, passwordHash })
      .returning({ id: users.id, email: users.email, name: users.name });
    await provisionNewUserTx(tx, u.id, name);
    return u;
  });

  return {
    status: 201,
    body: { ok: true, token: signSession(user.id), user },
  };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(raw: unknown): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 400, body: { error: "Validation failed" } };
  }
  const { email, password } = parsed.data;

  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
  // Same message for unknown email and wrong password — no account oracle.
  const rejection = {
    status: 401,
    body: { error: "Wrong email or password." },
  };
  if (!user?.passwordHash) return rejection; // unknown or OAuth-only account

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return rejection;

  return {
    status: 200,
    body: {
      ok: true,
      token: signSession(user.id),
      user: { id: user.id, email: user.email, name: user.name },
    },
  };
}
