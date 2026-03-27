import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ReactErrorBoundary } from "@/components/ReactErrorBoundary";

/** iOS safe-area(env)가 동작하도록 — DBG가 노치 밖으로 밀리거나 안 보이는 현상 완화 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vape Lounge",
  description: "전자담배 테마 실시간 인터랙티브 커뮤니티 공간",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-[100dvh] overflow-hidden flex flex-col">
        <ReactErrorBoundary>{children}</ReactErrorBoundary>
      </body>
    </html>
  );
}
