import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lead Check | Worrki",
  description: "Проверка и скоринг лидов для Worrki",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
