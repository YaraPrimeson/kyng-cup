import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tournament Rules — KYNG CUP",
  description: "General rules for taking part in KYNG CUP tennis and padel tournaments.",
  alternates: { canonical: "/rules/" },
};

export default function RulesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
