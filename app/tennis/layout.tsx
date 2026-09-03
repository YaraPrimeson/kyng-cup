import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tennis Tournaments in Vienna — KYNG CUP", description: "Join competitive KYNG CUP tennis tournaments in Vienna: strong players, considered organisation and a community worth returning to.", alternates: { canonical: "/tennis/" }, openGraph: { title: "Tennis Tournaments in Vienna — KYNG CUP", description: "Join competitive KYNG CUP tennis tournaments in Vienna.", images: [] }, twitter: { title: "Tennis Tournaments in Vienna — KYNG CUP", description: "Join competitive KYNG CUP tennis tournaments in Vienna.", images: [] } };
export default function TennisLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
