import { sportCopy } from "@/lib/sports";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: sportCopy("Tennis & Padel Tournaments in Vienna — KYNG CUP", "Padel Tournaments in Vienna — KYNG CUP"),
  description: sportCopy("See upcoming KYNG CUP tennis and padel tournaments in Vienna and register your pair.", "See upcoming KYNG CUP padel tournaments in Vienna and register your pair."),
  alternates: { canonical: "/upcoming-tournaments/" },
  openGraph: {
    title: "Upcoming KYNG CUP Tournaments in Vienna",
    description: sportCopy("Choose tennis or padel and register your pair for KYNG CUP in Vienna.", "Register your pair for KYNG CUP padel in Vienna."),
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Upcoming KYNG CUP Tournaments in Vienna",
    description: sportCopy("Choose tennis or padel and register your pair for KYNG CUP in Vienna.", "Register your pair for KYNG CUP padel in Vienna."),
    images: ["/og.png"],
  },
};

export default function UpcomingTournamentsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
