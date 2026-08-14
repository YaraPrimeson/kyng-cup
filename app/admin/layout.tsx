import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tournament Admin — KYNG CUP",
  description: "Protected KYNG CUP tournament management.",
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
