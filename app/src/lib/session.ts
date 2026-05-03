import { getIronSession, IronSession } from "iron-session";
import { cookies, headers } from "next/headers";

export interface SessionData {
  userId: string;
  loginId: string;
  displayName: string;
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

function isSecureRequest(headerStore: Headers) {
  const forwardedProto = headerStore.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim() === "https";
  }

  const origin = headerStore.get("origin");
  if (origin) {
    return origin.startsWith("https://");
  }

  const referer = headerStore.get("referer");
  if (referer) {
    return referer.startsWith("https://");
  }

  return false;
}

async function getSessionOptions() {
  const headerStore = await headers();
  return {
    password: process.env.SESSION_SECRET!,
    cookieName: "climb-session",
    ttl: SESSION_TIMEOUT_SECONDS,
    cookieOptions: {
      secure: isSecureRequest(headerStore),
      httpOnly: true,
      sameSite: "lax" as const,
      maxAge: undefined,
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const session = await getIronSession<SessionData>(await cookies(), await getSessionOptions());
  const isExpired = !session.expiresAt || session.expiresAt <= Date.now();

  if (session.isLoggedIn && (session.bootId !== SESSION_BOOT_ID || isExpired)) {
    session.userId = "";
    session.loginId = "";
    session.displayName = "";
    session.isLoggedIn = false;
    session.bootId = undefined;
    session.expiresAt = undefined;
  }

  return session;
}

export async function refreshSession(session: IronSession<SessionData>) {
  if (!session.isLoggedIn) return;

  session.expiresAt = getSessionExpiresAt();
  await session.save();
}
