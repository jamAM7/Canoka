import "./globals.css";
import "@/styles/variables.css";
import "@/styles/styles.css";
import "@/styles/calendar-extra.css";
import "@/styles/dashboard-extra.css";
import type { Metadata } from "next";
import { Karla } from "next/font/google";
import { PREFERENCES_SCRIPT } from "@/lib/ui/preferences";

const karla = Karla({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-karla",
});

export const metadata: Metadata = {
  title: "Canoka",
  description: "Canvas-synced notes, calendar, and quizzes for students.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The preferences script sets data-* attributes on <html> before React
    // hydrates, so the server's <html> differs from the browser's on purpose.
    <html lang="en" className={karla.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
