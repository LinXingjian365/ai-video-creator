import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const display = localFont({
  src: [
    { path: "./fonts/sora-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/sora-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/sora-800.woff2", weight: "800", style: "normal" }
  ],
  variable: "--font-display",
  display: "swap"
});

const mono = localFont({
  src: [
    { path: "./fonts/plexmono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plexmono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/plexmono-600.woff2", weight: "600", style: "normal" }
  ],
  variable: "--font-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "AI 视频增长控制台",
  description: "真实热点情报、自动剪辑与多平台成片的本地创作控制台。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
