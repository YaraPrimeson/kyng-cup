import type { Metadata } from "next";

export const metadata: Metadata = { title: "Padel Tournaments in Vienna — KYNG CUP", description: "Join competitive KYNG CUP padel tournaments in Vienna: fast play, thoughtful organisation and a community built around partnership.", alternates: { canonical: "/padel/" }, openGraph: { title: "Padel Tournaments in Vienna — KYNG CUP", description: "Join competitive KYNG CUP padel tournaments in Vienna.", images: [] }, twitter: { title: "Padel Tournaments in Vienna — KYNG CUP", description: "Join competitive KYNG CUP padel tournaments in Vienna.", images: [] } };
export default function PadelLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
