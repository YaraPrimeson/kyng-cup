import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Bracket — KYNG CUP Vienna 2026",
  description: "Live results and the complete 16-pair tournament bracket for KYNG CUP Vienna 2026.",
};

export default function BracketLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
