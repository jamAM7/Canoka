<<<<<<< HEAD
import "../globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Canoka",
  description: "A simple student workspace for assignments, calendars, and notes.",
=======
import "./globals.css";
import "@/styles/variables.css";
import "@/styles/styles.css";
import "@/styles/calendar-extra.css";
import "@/styles/dashboard-extra.css";
import type { Metadata } from "next";
import { Karla } from "next/font/google";

const karla = Karla({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-karla",
});

export const metadata: Metadata = {
  title: "Canoka",
  description: "Canvas-synced notes, calendar, and quizzes for students.",
>>>>>>> origin/Mind
};

export default function RootLayout({
  children,
<<<<<<< HEAD
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
=======
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={karla.variable}>
      <body>{children}</body>
    </html>
  );
}
>>>>>>> origin/Mind
