import type { ReactNode } from "react";

export const metadata = {
  title: "KYNG CUP · Telegram-демо",
  robots: { index: false, follow: false },
};

export default function TelegramDemoLayout({ children }: { children: ReactNode }) {
  return children;
}
