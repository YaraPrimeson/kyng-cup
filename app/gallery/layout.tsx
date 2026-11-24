import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tournament photo gallery — KYNG CUP",
  description: "Explore photos from KYNG CUP tournaments.",
  alternates: { canonical: "/gallery/" },
  openGraph: { images: ["/og.png"] },
};

export default function GalleryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
