import type { Metadata } from "next";
import Wordmark from "../wordmark";

export const metadata: Metadata = {
  title: "Cookie Policy — KYNG CUP",
  description: "How KYNG CUP uses cookies and browser storage.",
};

export default function CookiesPage() {
  return (
    <main className="legal-page">
      <header><a className="brand" href="../"><Wordmark /></a><a href="../">Back to home ↗</a></header>
      <article>
        <p className="eyebrow">Privacy notice · Updated 14 August 2026</p>
        <h1>Cookie<br />policy<span>.</span></h1>
        <section><h2>What we store</h2><p>KYNG CUP uses essential browser storage to keep administrators securely signed in, remember cookie preferences and maintain reliable site functionality.</p></section>
        <section><h2>Essential storage</h2><p>Authentication information is required for the protected tournament administration area. It cannot be disabled from the cookie banner because the admin area would no longer work.</p></section>
        <section><h2>Optional cookies</h2><p>We currently do not use advertising cookies. If analytics or marketing tools are added later, optional cookies will only be activated after consent.</p></section>
        <section><h2>Your choice</h2><p>You may choose “Necessary only” or “Accept all” in the banner. The choice is saved on this device. Clearing browser data will reset it and show the banner again.</p></section>
        <section><h2>Contact</h2><p>Questions about privacy can be sent to <a href="mailto:hello@kyngcup.com">hello@kyngcup.com</a>.</p></section>
      </article>
    </main>
  );
}
