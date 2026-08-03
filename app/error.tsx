"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="error-page">
      <section className="error-card">
        <span>TIMEBOX</span>
        <h1>페이지를 불러오지 못했어요</h1>
        <p>잠시 연결이 불안정하거나 일정 데이터를 준비하는 중일 수 있어요.</p>
        <div>
          <button onClick={reset}>다시 시도</button>
          <Link href="/login">로그인으로 돌아가기</Link>
        </div>
      </section>
    </main>
  );
}
