"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_TIME_ZONE_COOKIE } from "@/lib/plan-calendar";

function readCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
}

export default function ClientTimeZoneCookie() {
  const router = useRouter();

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;

    const encoded = encodeURIComponent(timeZone);
    if (readCookie(CLIENT_TIME_ZONE_COOKIE) === encoded) return;

    document.cookie = `${CLIENT_TIME_ZONE_COOKIE}=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }, [router]);

  return null;
}
