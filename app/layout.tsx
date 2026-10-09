import "./globals.css";
import "@/styles/variables.css";
import "@/styles/styles.css";
import "@/styles/calendar-extra.css";
import "@/styles/dashboard-extra.css";
import type { Metadata } from "next";
import { Poppins, Sintony } from "next/font/google";
import { PREFERENCES_SCRIPT } from "@/lib/ui/preferences";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

// Sintony only ships in regular and bold.
const sintony = Sintony({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-sintony",
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
    <html lang="en" className={`${poppins.variable} ${sintony.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
