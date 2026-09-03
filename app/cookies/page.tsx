import type { Metadata } from "next";
import CookieContent from "./cookie-content";

export const metadata: Metadata = {
  title: "Privacy & Cookie Policy — KYNG CUP",
  description: "How KYNG CUP processes tournament registration data and uses essential storage and optional analytics cookies.",
  alternates: { canonical: "/cookies/" },
};

export default function CookiesPage() {
  return (
    <main className="legal-page">
      <CookieContent />
    </main>
  );
}
