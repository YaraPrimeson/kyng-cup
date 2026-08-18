import type { Metadata } from "next";

export const metadata: Metadata = { title: "KYNG CUP Tennis — Vienna", description: "Competitive tennis tournaments and community in Vienna.", openGraph: { title: "KYNG CUP Tennis — Vienna", description: "Competitive tennis tournaments and community in Vienna.", images: [] }, twitter: { title: "KYNG CUP Tennis — Vienna", description: "Competitive tennis tournaments and community in Vienna.", images: [] } };
export default function TennisLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
