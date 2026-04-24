import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId: string;
  username: string;
  isLoggedIn: boolean;
  bootId?: string;
  expiresAt?: number;
}

const SESSION_BOOT_ID = process.env.HOSTNAME ?? "local-dev";
const SESSION_TIMEOUT_SECONDS = 30 * 60;
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_SECONDS * 1000;

export function getSessionBootId() {
  return SESSION_BOOT_ID;
}

export function getSessionExpiresAt() {
  return Date.now() + SESSION_TIMEOUT_MS;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "climb-session",
  ttl: SESSION_TIMEOUT_SECONDS,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: SESSION_TIMEOUT_SECONDS,
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const isExpired = !session.expiresAt || session.expiresAt <= Date.now();

  if (session.isLoggedIn && (session.bootId !== SESSION_BOOT_ID || isExpired)) {
    session.userId = "";
    session.username = "";
    session.isLoggedIn = false;
    session.bootId = undefined;
    session.expiresAt = undefined;
  }

  return session;
}
