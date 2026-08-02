import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { DEMO_OWNER, getUser, type UserRow } from "./tenant";

const COOKIE = "qm_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET not set: refusing to issue sessions");
  }
  return value;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  // A seeded account with no password can never be logged into.
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(plain, hash);
}

const b64 = (input: string) => Buffer.from(input).toString("base64url");

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** `<base64url payload>.<base64url hmac>` — stateless, no sessions table. */
export function signSession(uid: string): string {
  const payload = b64(
    JSON.stringify({ uid, exp: Date.now() + MAX_AGE_SECONDS * 1000 })
  );
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(signature);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return null;
  }
  try {
    const { uid, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    ) as { uid?: string; exp?: number };
    if (!uid || !exp || Date.now() > exp) return null;
    return uid;
  } catch {
    return null;
  }
}

export function sessionCookie(uid: string) {
  return {
    name: COOKIE,
    value: signSession(uid),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

export function clearedCookie() {
  return { ...sessionCookie("none"), value: "", maxAge: 0 };
}

/** The signed-in user, or null. Works in server components and routes. */
export async function currentUser(): Promise<UserRow | null> {
  let token: string | undefined;
  try {
    token = cookies().get(COOKIE)?.value;
  } catch {
    return null;
  }
  const uid = readSessionToken(token);
  return uid ? getUser(uid) : null;
}

export class Unauthorized extends Error {
  constructor() {
    super("sign in required");
    this.name = "Unauthorized";
  }
}

export async function requireUser(): Promise<UserRow> {
  const user = await currentUser();
  if (!user) throw new Unauthorized();
  return user;
}

/**
 * Owner for read surfaces: the signed-in user, else the demo account.
 * Keeps the published NANDA plugin, its tests, and the CLI demo scripts
 * working with no credentials, while a signed-in visitor only ever sees
 * their own data.
 */
export async function ownerOrDemo(): Promise<string> {
  return (await currentUser())?.id ?? DEMO_OWNER;
}
