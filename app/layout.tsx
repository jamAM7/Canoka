import "./globals.css";
import "@/styles/variables.css";
import "@/styles/styles.css";
import "@/styles/calendar-extra.css";
import "@/styles/dashboard-extra.css";
import type { Metadata } from "next";
import { Poppins, Sintony } from "next/font/google";

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
    <html lang="en" className={`${poppins.variable} ${sintony.variable}`}>
      <body>{children}</body>
    </html>
  );
}
