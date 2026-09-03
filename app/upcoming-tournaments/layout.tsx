import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tennis & Padel Tournaments in Vienna — KYNG CUP",
  description: "Register your pair for KYNG CUP tennis on 20 September 2026 or padel on 26 September 2026 in Vienna.",
  alternates: { canonical: "/upcoming-tournaments/" },
  openGraph: {
    title: "KYNG CUP Vienna — September 2026 Tournaments",
    description: "Choose tennis or padel and register your pair for KYNG CUP in Vienna.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "KYNG CUP Vienna — September 2026 Tournaments",
    description: "Choose tennis or padel and register your pair for KYNG CUP in Vienna.",
    images: ["/og.png"],
  },
};

export default function UpcomingTournamentsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
