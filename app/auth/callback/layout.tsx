import type { Metadata } from "next";
import "../../profile/profile.css";

export const metadata: Metadata = { title: "Вход — KYNG CUP", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function AuthCallbackLayout({ children }: { children: React.ReactNode }) { return children; }
