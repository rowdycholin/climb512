import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId: string;
  username: string;
  isLoggedIn: boolean;
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
  return session;
}
