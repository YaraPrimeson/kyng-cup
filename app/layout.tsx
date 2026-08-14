import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import SiteUtilities from "./site-utilities";
import "./globals.css";

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cormorant-garamond",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KYNG CUP — More Than a Game",
  description: "International tennis and padel tournaments built around competition, atmosphere and community.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "KYNG CUP — More Than a Game",
    description: "International tennis and padel tournaments built around competition, atmosphere and community.",
    type: "website",
    images: [{ url: "/og.png", width: 1736, height: 909, alt: "KYNG CUP — More Than a Game" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "KYNG CUP — More Than a Game",
    description: "International tennis and padel tournaments built around competition, atmosphere and community.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={cormorantGaramond.variable}>
        {children}
        <SiteUtilities />
      </body>
    </html>
  );
}
