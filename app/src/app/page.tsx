import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPostLoginPath } from "@/lib/post-login-route";

export default async function Home() {
  const session = await getSession();
  if (session.isLoggedIn) redirect(await getPostLoginPath(session.userId));
  redirect("/login");
}
