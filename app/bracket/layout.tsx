import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Tournament Bracket — KYNG CUP Vienna",
  description: "Live results and tournament brackets for KYNG CUP padel events in Vienna.",
};

export default function BracketLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
