import type { Metadata } from "next";
import CookieContent from "./cookie-content";

export const metadata: Metadata = {
  title: "Cookie Policy — KYNG CUP",
  description: "How KYNG CUP uses cookies and browser storage.",
};

export default function CookiesPage() {
  return (
    <main className="legal-page">
      <CookieContent />
    </main>
  );
}
