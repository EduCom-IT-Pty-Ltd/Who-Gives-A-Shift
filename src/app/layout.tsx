import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/** Fredoka matches the logo's chunky rounded lettering; Nunito is its readable sibling. */
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Who Gives A Shift",
    template: "%s · Who Gives A Shift",
  },
  description: "Rostering and timesheet approval for Kee.",
  applicationName: "Who Gives A Shift",
  openGraph: {
    title: "Who Gives A Shift",
    description: "Rostering and timesheet approval for Kee.",
    siteName: "Who Gives A Shift",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf8f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1424" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${fredoka.variable} ${nunito.variable}`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
