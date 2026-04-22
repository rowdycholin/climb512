import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Climb512 — AI Climbing Training",
  description: "Personalised climbing training plans powered by AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground">{children}</body>
    </html>
  );
}
