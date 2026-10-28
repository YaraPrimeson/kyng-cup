import type { Metadata } from "next";
import "./profile.css";

export const metadata: Metadata = {
  title: "My KYNG — Player profile",
  description: "Your KYNG CUP tournaments, matches, progress and next steps in one place.",
};

export default function ProfileLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
