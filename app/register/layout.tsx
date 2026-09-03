import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tournament registration — KYNG CUP",
  description: "Apply as a ready-made pair for a KYNG CUP tennis or padel tournament.",
  alternates: { canonical: "/register/" },
  openGraph: { title: "Tournament registration — KYNG CUP", description: "Apply as a ready-made pair for a KYNG CUP tennis or padel tournament.", images: [] },
  twitter: { title: "Tournament registration — KYNG CUP", description: "Apply as a ready-made pair for a KYNG CUP tennis or padel tournament.", images: [] },
};

export default function RegisterLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
