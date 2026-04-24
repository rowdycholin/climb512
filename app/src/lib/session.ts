import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId: string;
  username: string;
  isLoggedIn: boolean;
  bootId?: string;
}

const SESSION_BOOT_ID = process.env.HOSTNAME ?? "local-dev";

export function getSessionBootId() {
  return SESSION_BOOT_ID;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "climb-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (session.isLoggedIn && session.bootId !== SESSION_BOOT_ID) {
    session.userId = "";
    session.username = "";
    session.isLoggedIn = false;
    session.bootId = undefined;
  }

  return session;
}
