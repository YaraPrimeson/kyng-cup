import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connection Lost — KYNG CUP",
  description: "KYNG CUP offline fallback page.",
};

export default function OfflineLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
