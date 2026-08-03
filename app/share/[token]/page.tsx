import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type SharedBlock = {
  title: string;
  kind: "task" | "planning" | "buffer" | "appointment";
  start: string;
  end: string;
  status: string;
};

type SharedSchedule = {
  date: string;
  timezone: string;
  blocks: SharedBlock[];
};

export const metadata: Metadata = {
  title: "공유 일정 — Timebox",
  description: "Timebox로 계획한 하루 일정을 확인하세요.",
  robots: { index: false, follow: false },
};

function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${value}T12:00:00Z`));
}

function isSharedSchedule(value: unknown): value is SharedSchedule {
  if (!value || typeof value !== "object") return false;
  const schedule = value as Partial<SharedSchedule>;
  return typeof schedule.date === "string" && typeof schedule.timezone === "string" && Array.isArray(schedule.blocks);
}

export default async function SharedSchedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_schedule", { p_token: token });
  const schedule = !error && isSharedSchedule(data) ? data : null;

  if (!schedule) {
    return (
      <main className="shared-page shared-empty">
        <LockKeyhole size={28} />
        <h1>공유 링크를 열 수 없어요</h1>
        <p>링크가 만료되었거나 공유가 종료됐을 수 있어요.</p>
        <Link href="/">Timebox로 돌아가기</Link>
      </main>
    );
  }

  return (
    <main className="shared-page">
      <header className="shared-heading">
        <span>TIMEBOX · SHARED DAY</span>
        <h1>{dateLabel(schedule.date)}</h1>
        <p><LockKeyhole size={13} /> 링크를 받은 사람만 볼 수 있는 읽기 전용 일정입니다.</p>
      </header>
      <section className="shared-card">
        <div className="shared-card-title"><CalendarDays size={17} /><strong>하루 일정</strong><small>{schedule.blocks.length}개 타임블록</small></div>
        <div className="shared-blocks">
          {schedule.blocks.length ? schedule.blocks.map((block, index) => (
            <article key={`${block.start}-${index}`} data-kind={block.kind}>
              <time><Clock3 size={13} /> {timeLabel(block.start, schedule.timezone)}–{timeLabel(block.end, schedule.timezone)}</time>
              <strong>{block.title}</strong>
              {block.status === "completed" && <span><CheckCircle2 size={13} /> 완료</span>}
            </article>
          )) : <p className="shared-no-blocks">공유된 타임블록이 아직 없어요.</p>}
        </div>
      </section>
      <footer className="shared-footer"><Link href="/">나도 Timebox 시작하기</Link></footer>
    </main>
  );
}
