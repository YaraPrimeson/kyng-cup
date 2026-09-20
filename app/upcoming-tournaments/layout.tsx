import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Padel Tournaments in Vienna — KYNG CUP",
  description: "See upcoming KYNG CUP padel tournaments in Vienna and register your pair.",
  alternates: { canonical: "/upcoming-tournaments/" },
  openGraph: {
    title: "Upcoming KYNG CUP Tournaments in Vienna",
    description: "Choose a padel tournament and register your pair for KYNG CUP in Vienna.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Upcoming KYNG CUP Tournaments in Vienna",
    description: "Choose a padel tournament and register your pair for KYNG CUP in Vienna.",
    images: ["/og.png"],
  },
};

export default function UpcomingTournamentsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
