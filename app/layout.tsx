import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "Timebox — 오늘을 시간으로 설계하세요",
    description:
      "브레인덤프부터 오늘의 우선순위, 타임블록 실행과 회고까지 한 곳에서 관리하는 타임박싱 플래너",
    openGraph: {
      title: "Timebox — 오늘을 시간으로 설계하세요",
      description: "머릿속 할 일을 꺼내고, 중요한 일부터 시간에 배치하세요.",
      type: "website",
      locale: "ko_KR",
      images: [{ url: `${origin}/og.png`, width: 1536, height: 1024, alt: "Timebox 일정 플래너" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Timebox — 오늘을 시간으로 설계하세요",
      description: "머릿속 할 일을 꺼내고, 중요한 일부터 시간에 배치하세요.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
