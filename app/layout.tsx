import type { Metadata } from "next";
import { Lora } from "next/font/google";
import { LanguageProvider } from "./i18n";
import SiteHeader from "./site-header";
import SiteUtilities from "./site-utilities";
import "./globals.css";

const lora = Lora({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KYNG CUP — More Than a Game",
  description: "International tennis and padel tournaments built around competition, atmosphere and community.",
  icons: { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/favicon.png" },
  openGraph: {
    title: "KYNG CUP — More Than a Game",
    description: "International tennis and padel tournaments built around competition, atmosphere and community.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "KYNG CUP — More Than a Game" }],
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
      <body className={lora.variable}>
        <LanguageProvider>
          <SiteHeader />
          {children}
          <SiteUtilities />
        </LanguageProvider>
      </body>
    </html>
  );
}
