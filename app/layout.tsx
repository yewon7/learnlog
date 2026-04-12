import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LearnLog",
  description: "AI 학습 지식 갭 분석 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
