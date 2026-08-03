"use client";

import {
  DragDropProvider,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/react";
import {
  BarChart3,
  BriefcaseBusiness,
  BookOpenText,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  GripVertical,
  History,
  Inbox,
  LoaderCircle,
  Minus,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Save,
  Search,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { dateInTimeZone, shiftIsoDate } from "@/lib/date";
import { FormEvent, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadRecordBundle, type ActivityKind, type RecordBundle } from "./records-data";
import { PlannerStoreProvider, usePlannerStore, type PlannerSeed } from "./store";
import type { TagName, Task, TimeBlock } from "./types";

const DAY_START_HOUR = 5;
const DAY_END_HOUR = 24;
const TAG_OPTIONS: TagName[] = ["미분류", "업무", "일상", "자소서", "면접", "메시지", "성장"];
const ESTIMATE_OPTIONS = [15, 30, 45, 60, 90, 120, 180] as const;
const MOODS = ["매우 힘듦", "힘듦", "보통", "좋음", "아주 좋음"];

type Page = "today" | "journal" | "records";
type ServiceMode = "professional" | "paper";
type RecordTab = "summary" | "activity";
type Period = "day" | "week" | "month" | "quarter" | "year" | "all";

const MODE_STORAGE_KEY = "timebox-service-mode";
const MODE_CHANGE_EVENT = "timebox-service-mode-change";

function subscribeServiceMode(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(MODE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(MODE_CHANGE_EVENT, callback);
  };
}

function getServiceModeSnapshot(): ServiceMode {
  return window.localStorage.getItem(MODE_STORAGE_KEY) === "professional" ? "professional" : "paper";
}

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00`));
}

function Logo() {
  return (
    <div className="paper-brand" aria-label="Timebox 홈">
      <span className="paper-brand-clock" aria-hidden="true"><span /></span>
      <span>TIMEBOX</span>
    </div>
  );
}

function CompactTask({ task, priority = false }: { task: Task; priority?: boolean }) {
  const blocks = usePlannerStore((state) => state.blocks);
  const planStatus = usePlannerStore((state) => state.planStatus);
  const toggleMit = usePlannerStore((state) => state.toggleMit);
  const scheduleTask = usePlannerStore((state) => state.scheduleTask);
  const updateTask = usePlannerStore((state) => state.updateTask);
  const discardTask = usePlannerStore((state) => state.discardTask);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [tag, setTag] = useState<TagName>(task.tag);
  const [estimate, setEstimate] = useState(task.estimate);
  const scheduled = blocks.some((block) => block.taskId === task.id);
  const beginEditing = () => {
    setTitle(task.title);
    setTag(task.tag);
    setEstimate(task.estimate);
    setEditing(true);
  };
  const { ref, handleRef, isDragging } = useDraggable({
    id: `${priority ? "priority" : "task"}:${task.id}`,
    data: { kind: "task", taskId: task.id, title: task.title },
    disabled: scheduled || planStatus === "closed",
  });

  const save = () => {
    updateTask(task.id, { title, tag, estimate });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="note-task-editor">
        <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="할 일 제목" autoFocus />
        <div>
          <select value={tag} onChange={(event) => setTag(event.target.value as TagName)} aria-label="태그">
            {TAG_OPTIONS.map((option) => <option key={option}>{option}</option>)}
          </select>
          <select value={estimate} onChange={(event) => setEstimate(Number(event.target.value))} aria-label="예상 시간" disabled={scheduled} title={scheduled ? "배치된 일정 블록의 끝을 끌어 시간을 바꿔 주세요." : undefined}>
            {ESTIMATE_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes}분</option>)}
          </select>
          <button onClick={save}><Check size={15} /> 저장</button>
          <button className="icon-only" onClick={() => setEditing(false)} aria-label="취소"><X size={15} /></button>
        </div>
      </div>
    );
  }

  return (
    <article ref={ref} className="note-task" data-dragging={isDragging} data-priority={priority} data-scheduled={scheduled}>
      <button ref={handleRef} className="note-drag" aria-label={`${task.title} 드래그`}><GripVertical size={15} /></button>
      <button className="note-star" data-active={task.isMit} onClick={() => toggleMit(task.id)} aria-label="오늘의 우선순위 전환">
        <Star size={15} fill={task.isMit ? "currentColor" : "none"} />
      </button>
      <button className="note-task-copy" onClick={() => scheduleTask(task.id)} title={scheduled ? "이미 시간표에 배치됨" : planStatus === "closed" ? "오늘 기록을 완료한 일정입니다" : "빈 시간에 배치"} disabled={scheduled || planStatus === "closed"}>
        <strong>{task.title}</strong>
        <span><Tag size={11} /> {task.tag} · {task.estimate}분{scheduled && <em>시간표에 배치됨</em>}</span>
      </button>
      <button className="icon-only note-edit" onClick={beginEditing} aria-label="할 일 수정"><Pencil size={14} /></button>
      {!priority && <button className="icon-only note-delete" onClick={() => discardTask(task.id)} aria-label="휴지통으로 이동"><Trash2 size={14} /></button>}
    </article>
  );
}

function AddTaskForm() {
  const addTask = usePlannerStore((state) => state.addTask);
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState<TagName>("미분류");
  const [estimate, setEstimate] = useState(30);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    addTask(title, tag, estimate);
    setTitle("");
  };

  return (
    <form className="brain-add" onSubmit={submit}>
      <div className="brain-add-line">
        <Plus size={17} />
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="머릿속 할 일을 바로 적어보세요" aria-label="새 할 일" />
        <button type="submit">추가</button>
      </div>
      <div className="brain-add-options">
        <label><Tag size={13} /><select value={tag} onChange={(event) => setTag(event.target.value as TagName)}>{TAG_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label><Clock3 size={13} /><select value={estimate} onChange={(event) => setEstimate(Number(event.target.value))}>{ESTIMATE_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes}분 예상</option>)}</select></label>
      </div>
    </form>
  );
}

function PrioritySection() {
  const tasks = usePlannerStore((state) => state.tasks);
  const priorities = tasks.filter((task) => task.isMit && !task.completed).slice(0, 3);
  return (
    <section className="paper-section priority-note">
      <div className="paper-section-title"><span>TOP PRIORITIES</span><small>오늘 가장 중요한 3가지</small></div>
      <div className="priority-list">
        {[0, 1, 2].map((index) => priorities[index]
          ? <div className="priority-line" key={priorities[index].id}><b>{index + 1}</b><CompactTask task={priorities[index]} priority /></div>
          : <div className="priority-empty" key={index}><b>{index + 1}</b><span>브레인덤프에서 별을 눌러 선택하세요</span></div>)}
      </div>
    </section>
  );
}

function BrainDumpSection() {
  const tasks = usePlannerStore((state) => state.tasks);
  const active = tasks.filter((task) => !task.completed);
  return (
    <section className="paper-section brain-note">
      <div className="paper-section-title"><span>BRAIN DUMP</span><small>모든 생각 쏟아내기 · {active.length}</small></div>
      <AddTaskForm />
      <div className="brain-list">
        {active.length ? active.map((task) => <CompactTask key={task.id} task={task} />) : (
          <div className="brain-empty"><Inbox size={22} /><p>완료하지 않은 일은 내일도 이곳에 남아요.</p></div>
        )}
      </div>
    </section>
  );
}

function TimeSlot({ minutes, visible }: { minutes: number; visible: boolean }) {
  const planStatus = usePlannerStore((state) => state.planStatus);
  const { ref, isDropTarget } = useDroppable({ id: `slot:${minutes}`, disabled: !visible || planStatus === "closed" });
  return <div ref={ref} className="quarter-slot" data-hidden={!visible} data-target={isDropTarget} aria-hidden={!visible} />;
}

function BlockSegment({ block, hour, isLast }: { block: TimeBlock; hour: number; isLast: boolean }) {
  const tasks = usePlannerStore((state) => state.tasks);
  const planStatus = usePlannerStore((state) => state.planStatus);
  const selectBlock = usePlannerStore((state) => state.selectBlock);
  const toggleBlockComplete = usePlannerStore((state) => state.toggleBlockComplete);
  const selectedBlockId = usePlannerStore((state) => state.selectedBlockId);
  const previewResizeBlock = usePlannerStore((state) => state.previewResizeBlock);
  const resizeBlock = usePlannerStore((state) => state.resizeBlock);
  const hourStart = hour * 60;
  const start = Math.max(block.start, hourStart);
  const end = Math.min(block.start + block.duration, hourStart + 60);
  const startQuarter = Math.floor((start - hourStart) / 15);
  const span = Math.max(1, Math.ceil((end - start) / 15));
  const first = start === block.start;
  const isMit = Boolean(block.taskId && tasks.find((task) => task.id === block.taskId)?.isMit);
  const { ref, handleRef, isDragging } = useDraggable({
    id: `block:${block.id}:${hour}`,
    data: { kind: "block", blockId: block.id, title: block.title, segmentOffset: start - block.start },
    disabled: planStatus === "closed",
  });

  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    selectBlock(block.id);
    const track = event.currentTarget.closest(".hour-track")?.getBoundingClientRect();
    if (!track?.width) return;
    const startX = event.clientX;
    const originalDuration = block.duration;
    let nextDuration = originalDuration;

    const move = (pointerEvent: PointerEvent) => {
      const deltaMinutes = (pointerEvent.clientX - startX) * (60 / track.width);
      nextDuration = Math.max(15, Math.round((originalDuration + deltaMinutes) / 15) * 15);
      previewResizeBlock(block.id, nextDuration);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (nextDuration !== originalDuration) resizeBlock(block.id, nextDuration, originalDuration);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };

  return (
    <article
      ref={ref}
      className="paper-block"
      data-color={block.color}
      data-completed={block.status === "completed"}
      data-selected={selectedBlockId === block.id}
      data-mit={isMit}
      data-dragging={isDragging}
      style={{ gridColumn: `${startQuarter + 1} / span ${span}` }}
      onClick={() => selectBlock(block.id)}
    >
      {planStatus !== "closed" && <button ref={handleRef} className="paper-block-drag" aria-label={`${block.title} 이동`} title="블록 몸통을 끌어서 이동"><GripVertical size={12} /></button>}
      <span className="paper-block-title">{first && isMit && <Star className="paper-block-mit" size={11} fill="currentColor" />}{first ? block.title : "↳ 계속"}</span>
      {first && <small>{formatTime(block.start)} · {formatDuration(block.duration)}</small>}
      {isLast && planStatus !== "closed" && (
        <>
          <button className="paper-block-check" data-checked={block.status === "completed"} onClick={(event) => { event.stopPropagation(); toggleBlockComplete(block.id); }} aria-label="완료 전환">
            {block.status === "completed" && <Check size={11} />}
          </button>
          <button className="paper-block-resize" onPointerDown={beginResize} aria-label={`${block.title} 길이 조절`} title="끌어서 시간 늘리기·줄이기"><span /></button>
        </>
      )}
    </article>
  );
}

function SelectedBlockBar() {
  const blocks = usePlannerStore((state) => state.blocks);
  const planStatus = usePlannerStore((state) => state.planStatus);
  const selectedBlockId = usePlannerStore((state) => state.selectedBlockId);
  const resizeBlock = usePlannerStore((state) => state.resizeBlock);
  const updateActualMinutes = usePlannerStore((state) => state.updateActualMinutes);
  const addBufferAfter = usePlannerStore((state) => state.addBufferAfter);
  const toggleBlockComplete = usePlannerStore((state) => state.toggleBlockComplete);
  const removeBlock = usePlannerStore((state) => state.removeBlock);
  const selected = blocks.find((block) => block.id === selectedBlockId);
  if (!selected) return null;
  const changed = selected.baselineStart !== undefined && (selected.start !== selected.baselineStart || selected.duration !== selected.baselineDuration);

  return (
    <div className="selected-block-bar">
      <div><strong>{selected.title}</strong><span>{formatTime(selected.start)}–{formatTime(selected.start + selected.duration)}</span></div>
      {changed && <span className="change-pill">확정 후 변경됨</span>}
      {planStatus === "closed" ? (
        <span className="closed-pill"><CheckCircle2 size={13} /> 오늘 기록 완료</span>
      ) : (
        <>
          <div className="resize-actions" aria-label="블록 크기 조정">
            <button onClick={() => resizeBlock(selected.id, selected.duration - 15)} aria-label="15분 줄이기"><Minus size={14} /></button>
            <b>{formatDuration(selected.duration)}</b>
            <button onClick={() => resizeBlock(selected.id, selected.duration + 15)} aria-label="15분 늘리기"><Plus size={14} /></button>
          </div>
          <label className="actual-time">실제 <input type="number" min="5" step="5" value={selected.actualMinutes ?? selected.duration} onChange={(event) => updateActualMinutes(selected.id, Number(event.target.value))} />분</label>
          <button className="quiet-action" onClick={() => addBufferAfter(selected.id)}>+ 15분 여유</button>
          <button className="remove-block-action" onClick={() => removeBlock(selected.id)}><Trash2 size={14} /> 일정에서 빼기</button>
          <button className="complete-action" data-completed={selected.status === "completed"} onClick={() => toggleBlockComplete(selected.id)}><Check size={15} /> {selected.status === "completed" ? "완료됨" : "완료"}</button>
        </>
      )}
    </div>
  );
}

function Timetable({ resolution }: { resolution: 15 | 30 }) {
  const blocks = usePlannerStore((state) => state.blocks);
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index);
  return (
    <section className="paper-section timetable-section">
      <div className="time-head">
        <span>TIME</span>
        <div className="time-head-columns" data-resolution={resolution}>
          <span>:00</span><span>:15</span><span>:30</span><span>:45</span>
        </div>
      </div>
      <div className="hour-grid" data-resolution={resolution}>
        {hours.map((hour) => {
          const segments = blocks.filter((block) => block.start < (hour + 1) * 60 && block.start + block.duration > hour * 60);
          return (
            <div className="hour-row" key={hour}>
              <time>{hour}</time>
              <div className="hour-track">
                {[0, 15, 30, 45].map((offset) => <TimeSlot key={offset} minutes={hour * 60 + offset} visible={resolution === 15 || offset % 30 === 0} />)}
                {segments.map((block) => <BlockSegment key={block.id} block={block} hour={hour} isLast={block.start + block.duration <= (hour + 1) * 60} />)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TodayView({ todayLabel }: { todayLabel: string }) {
  const router = useRouter();
  const userId = usePlannerStore((state) => state.userId);
  const planDate = usePlannerStore((state) => state.planDate);
  const planStatus = usePlannerStore((state) => state.planStatus);
  const blocks = usePlannerStore((state) => state.blocks);
  const confirmPlan = usePlannerStore((state) => state.confirmPlan);
  const closePlan = usePlannerStore((state) => state.closePlan);
  const [resolution, setResolution] = useState<15 | 30>(30);
  const [notesOpen, setNotesOpen] = useState(true);
  const planned = blocks.reduce((sum, block) => sum + block.duration, 0);
  const today = dateInTimeZone();
  const openDate = (offset: number) => {
    router.push(`/?date=${shiftIsoDate(planDate, offset)}`);
  };

  return (
    <main className="today-page">
      <div className="planner-heading">
        <div className="planner-date-copy">
          <p>DAILY PLANNER</p>
          <div className="planner-date-line">
            <div className="date-navigation">
              <button onClick={() => openDate(-1)} disabled={!userId} aria-label="이전 날짜"><ChevronLeft size={16} /></button>
              <h1>{todayLabel}</h1>
              <button onClick={() => openDate(1)} disabled={!userId} aria-label="다음 날짜"><ChevronRight size={16} /></button>
            </div>
            <span>{formatDuration(planned)} 계획됨</span>
            {userId && planDate !== today && <button className="today-jump" onClick={() => router.push("/")}>오늘</button>}
          </div>
        </div>
        <div className="planner-heading-actions">
          <button className="notes-toggle" onClick={() => setNotesOpen((open) => !open)}>{notesOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}{notesOpen ? "메모 닫기" : "메모 열기"}</button>
          <div className="resolution-switch"><span>눈금</span><button data-active={resolution === 30} onClick={() => setResolution(30)}>30분</button><button data-active={resolution === 15} onClick={() => setResolution(15)}>15분</button></div>
          {planStatus === "draft" ? (
            <button className="confirm-plan" onClick={confirmPlan}>계획 확정하기</button>
          ) : (
            <>
              <button className="confirm-plan" data-committed="true" onClick={confirmPlan}><Check size={15} /> 계획 확정됨</button>
              <button className="close-day" data-closed={planStatus === "closed"} onClick={closePlan} disabled={planStatus === "closed"}>
                <CheckCircle2 size={15} /> {planStatus === "closed" ? "오늘 기록 완료" : "오늘 일과 완료"}
              </button>
            </>
          )}
        </div>
      </div>
      <SelectedBlockBar />
      <div className="paper-planner" data-notes-open={notesOpen}>
        {notesOpen && <aside className="paper-notes"><PrioritySection /><BrainDumpSection /></aside>}
        <Timetable resolution={resolution} />
      </div>
      <p className="planner-help">확정 후에도 자유롭게 조정하세요. ‘오늘 일과 완료’를 누르면 확정 계획과 최종 일정의 차이만 기록됩니다.</p>
    </main>
  );
}

function JournalView({ onOpenRecords }: { onOpenRecords: () => void }) {
  const journal = usePlannerStore((state) => state.journal);
  const mood = usePlannerStore((state) => state.mood);
  const planDate = usePlannerStore((state) => state.planDate);
  const setJournal = usePlannerStore((state) => state.setJournal);
  const setMood = usePlannerStore((state) => state.setMood);
  const saveJournal = usePlannerStore((state) => state.saveJournal);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      saveJournal(true);
      setSaveState("saved");
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [journal, mood, saveJournal]);

  const insertPrompt = (prompt: string) => setJournal(`${journal}${journal.trim() ? "\n\n" : ""}${prompt}\n`);

  return (
    <main className="journal-page">
      <div className="journal-topline">
        <div><p>DAILY JOURNAL</p><h1>{dateLabel(planDate)}</h1></div>
        <div className="journal-save-state"><Save size={14} /> {saveState === "saving" ? "저장 중…" : saveState === "saved" ? "자동 저장됨" : "입력하면 자동 저장"}</div>
      </div>
      <div className="journal-sheet">
        <div className="mood-row" aria-label="오늘의 기분">
          <span>오늘의 기분</span>
          {MOODS.map((label, index) => <button key={label} title={label} data-active={mood === index + 1} onClick={() => setMood(index + 1)}>{index + 1}</button>)}
        </div>
        <div className="journal-prompts">
          <span>막막하면 한 줄부터</span>
          {["오늘 잘한 일", "방해받은 순간", "내일의 아주 작은 첫 행동"].map((prompt) => <button key={prompt} onClick={() => insertPrompt(prompt)}>{prompt}</button>)}
        </div>
        <textarea value={journal} onChange={(event) => setJournal(event.target.value)} onBlur={() => saveJournal(true)} placeholder={"오늘은 어떤 하루였나요?\n계획과 달랐던 순간, 느낀 감정, 내일 기억하고 싶은 것을 자유롭게 적어보세요."} aria-label="오늘의 일기" />
        <footer><span>{journal.trim().length}자</span><button onClick={() => saveJournal(false)}><Save size={15} /> 지금 저장</button><button onClick={onOpenRecords}><Search size={15} /> 지난 일기 찾기</button></footer>
      </div>
    </main>
  );
}

function cutoffFor(period: Period) {
  if (period === "all") return "0000-01-01";
  if (period === "day") {
    return dateInTimeZone();
  }
  const date = new Date();
  const days = period === "week" ? 7 : period === "month" ? 30 : period === "quarter" ? 90 : 365;
  date.setDate(date.getDate() - days + 1);
  return date.toISOString().slice(0, 10);
}

function activityIcon(kind: ActivityKind) {
  if (kind === "journal") return <BookOpenText size={15} />;
  if (kind === "schedule") return <History size={15} />;
  if (kind === "plan") return <CalendarDays size={15} />;
  return <CheckCircle2 size={15} />;
}

function demoRecords(planDate: string, tasks: Task[], blocks: TimeBlock[], journal: string, mood: number): RecordBundle {
  const tagMinutes = new Map<string, number>();
  for (const block of blocks) {
    const task = tasks.find((item) => item.id === block.taskId);
    if (task) tagMinutes.set(task.tag, (tagMinutes.get(task.tag) ?? 0) + block.duration);
  }
  return {
    days: [{
      date: planDate,
      plannedMinutes: blocks.reduce((sum, block) => sum + block.duration, 0),
      actualMinutes: blocks.reduce((sum, block) => sum + (block.actualMinutes ?? (block.status === "completed" ? block.duration : 0)), 0),
      completedBlocks: blocks.filter((block) => block.status === "completed").length,
      totalBlocks: blocks.length,
      mood,
      journal,
      changeCount: blocks.filter((block) => block.baselineStart !== undefined && (block.start !== block.baselineStart || block.duration !== block.baselineDuration)).length,
    }],
    tagMinutes: [...tagMinutes].map(([tag, minutes]) => ({ tag, date: planDate, minutes })),
    activities: [
      ...tasks.map((task) => ({ id: `demo-task-${task.id}`, occurredAt: `${planDate}T09:00:00`, date: planDate, kind: "task" as const, title: task.title, detail: `${task.tag} · 예상 ${task.estimate}분${task.completed ? " · 완료" : ""}` })),
      ...(journal.trim() ? [{ id: "demo-journal", occurredAt: `${planDate}T22:00:00`, date: planDate, kind: "journal" as const, title: `${planDate} 일기`, detail: journal }] : []),
    ],
  };
}

function RecordsView({ initialJournalSearch = false }: { initialJournalSearch?: boolean }) {
  const userId = usePlannerStore((state) => state.userId);
  const planDate = usePlannerStore((state) => state.planDate);
  const tasks = usePlannerStore((state) => state.tasks);
  const blocks = usePlannerStore((state) => state.blocks);
  const journal = usePlannerStore((state) => state.journal);
  const mood = usePlannerStore((state) => state.mood);
  const [tab, setTab] = useState<RecordTab>(initialJournalSearch ? "activity" : "summary");
  const [period, setPeriod] = useState<Period>("month");
  const [query, setQuery] = useState(initialJournalSearch ? "일기" : "");
  const [bundle, setBundle] = useState<RecordBundle>(() => demoRecords(planDate, tasks, blocks, journal, mood));
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    loadRecordBundle(userId)
      .then((result) => { if (active) setBundle(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "기록을 불러오지 못했어요."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const cutoff = cutoffFor(period);
  const days = bundle.days.filter((day) => day.date >= cutoff);
  const activities = bundle.activities.filter((activity) => activity.date >= cutoff);
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  const matches = (normalizedQuery ? bundle.activities : activities).filter((activity) => !normalizedQuery || `${activity.title} ${activity.detail} ${activity.date}`.toLocaleLowerCase("ko").includes(normalizedQuery));
  const planned = days.reduce((sum, day) => sum + day.plannedMinutes, 0);
  const actual = days.reduce((sum, day) => sum + day.actualMinutes, 0);
  const complete = days.reduce((sum, day) => sum + day.completedBlocks, 0);
  const total = days.reduce((sum, day) => sum + day.totalBlocks, 0);
  const changes = days.reduce((sum, day) => sum + day.changeCount, 0);
  const journalDays = days.filter((day) => day.journal.trim()).length;
  const tagMap = new Map<string, number>();
  for (const item of bundle.tagMinutes.filter((item) => item.date >= cutoff)) tagMap.set(item.tag, (tagMap.get(item.tag) ?? 0) + item.minutes);
  const tagTotals = [...tagMap].sort((a, b) => b[1] - a[1]);
  const maxTag = Math.max(1, ...tagTotals.map(([, minutes]) => minutes));

  return (
    <main className="records-page">
      <div className="records-heading"><div><p>ARCHIVE</p><h1>나의 기록</h1><span>일정, 일기, 변경 내역을 한곳에서 찾아보세요.</span></div></div>
      <div className="records-tools">
        <div className="record-tabs"><button data-active={tab === "summary"} onClick={() => setTab("summary")}><BarChart3 size={15} /> 요약 통계</button><button data-active={tab === "activity"} onClick={() => setTab("activity")}><History size={15} /> 활동 기록</button></div>
        <div className="period-tabs">{(["day", "week", "month", "quarter", "year", "all"] as Period[]).map((item) => <button key={item} data-active={period === item} onClick={() => setPeriod(item)}>{item === "day" ? "하루" : item === "week" ? "1주" : item === "month" ? "1개월" : item === "quarter" ? "3개월" : item === "year" ? "1년" : "전체"}</button>)}</div>
        <label className="records-search"><Search size={16} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="할 일, 태그, 일기, 날짜 검색" /><kbd>⌘ K</kbd></label>
      </div>

      {loading && <div className="records-state">기록을 정리하고 있어요…</div>}
      {error && <div className="records-state error">{error}</div>}

      {query.trim() && (
        <section className="search-results"><header><Search size={16} /><strong>검색 결과 {matches.length}개</strong></header>{matches.length ? matches.slice(0, 30).map((activity) => <article key={activity.id}><span data-kind={activity.kind}>{activityIcon(activity.kind)}</span><div><time>{activity.date}</time><strong>{activity.title}</strong><p>{activity.detail}</p></div></article>) : <p className="no-records">일정과 일기에서 일치하는 기록을 찾지 못했어요.</p>}</section>
      )}

      {!query.trim() && tab === "summary" && (
        <div className="records-summary">
          <section className="summary-cards">
            <article><span>계획한 시간</span><strong>{formatDuration(planned)}</strong><small>{days.length}일의 기록</small></article>
            <article><span>실제 수행 시간</span><strong>{formatDuration(actual)}</strong><small>계획 대비 {planned ? Math.round(actual / planned * 100) : 0}%</small></article>
            <article><span>완료율</span><strong>{total ? Math.round(complete / total * 100) : 0}%</strong><small>{complete}/{total} 타임블록</small></article>
            <article><span>기록한 일기</span><strong>{journalDays}일</strong><small>일정 변경 {changes}회</small></article>
          </section>
          <div className="summary-grid">
            <section className="record-card"><header><div><Tag size={16} /><strong>태그별 계획 시간</strong></div><small>선택 기간</small></header><div className="tag-bars">{tagTotals.length ? tagTotals.map(([tag, minutes]) => <div key={tag}><span>{tag}</span><i><b style={{ width: `${minutes / maxTag * 100}%` }} /></i><strong>{formatDuration(minutes)}</strong></div>) : <p className="no-records">아직 태그별 기록이 없어요.</p>}</div></section>
            <section className="record-card"><header><div><CalendarDays size={16} /><strong>날짜별 흐름</strong></div><small>최근 기록</small></header><div className="day-history">{days.length ? days.slice(0, 12).map((day) => <article key={day.date}><time>{dateLabel(day.date)}</time><div><span style={{ width: `${day.totalBlocks ? day.completedBlocks / day.totalBlocks * 100 : 0}%` }} /></div><strong>{day.totalBlocks ? Math.round(day.completedBlocks / day.totalBlocks * 100) : 0}%</strong>{day.journal && <BookOpenText size={13} />}</article>) : <p className="no-records">아직 날짜별 기록이 없어요.</p>}</div></section>
          </div>
        </div>
      )}

      {!query.trim() && tab === "activity" && (
        <section className="activity-feed">{matches.length ? matches.map((activity, index) => <article key={activity.id}><div className="activity-date">{index === 0 || matches[index - 1].date !== activity.date ? dateLabel(activity.date) : ""}</div><span className="activity-icon" data-kind={activity.kind}>{activityIcon(activity.kind)}</span><div><time>{new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(activity.occurredAt))}</time><strong>{activity.title}</strong><p>{activity.detail}</p></div></article>) : <p className="no-records">선택한 기간에 활동 기록이 없어요.</p>}</section>
      )}
    </main>
  );
}

function AppNav({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  return (
    <nav className="paper-nav" aria-label="주요 메뉴">
      <button data-active={page === "today"} onClick={() => setPage("today")}><CalendarDays size={16} /> 오늘</button>
      <button data-active={page === "journal"} onClick={() => setPage("journal")}><BookOpenText size={16} /> 일기</button>
      <button data-active={page === "records"} onClick={() => setPage("records")}><History size={16} /> 기록</button>
    </nav>
  );
}

function TimeboxDashboardInner({ todayLabel }: { todayLabel: string }) {
  const scheduleTask = usePlannerStore((state) => state.scheduleTask);
  const moveBlock = usePlannerStore((state) => state.moveBlock);
  const notice = usePlannerStore((state) => state.notice);
  const setNotice = usePlannerStore((state) => state.setNotice);
  const userId = usePlannerStore((state) => state.userId);
  const dailyPlanId = usePlannerStore((state) => state.dailyPlanId);
  const [page, setPage] = useState<Page>("today");
  const serviceMode = useSyncExternalStore(subscribeServiceMode, getServiceModeSnapshot, () => "paper");
  const [recordsIntent, setRecordsIntent] = useState<"all" | "journal">("all");
  const [sharing, setSharing] = useState(false);
  const openPage = (nextPage: Page) => {
    if (nextPage === "records") setRecordsIntent("all");
    setPage(nextPage);
  };

  const changeServiceMode = (mode: ServiceMode) => {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new Event(MODE_CHANGE_EVENT));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.canceled) return;
    const source = event.operation.source;
    const targetId = String(event.operation.target?.id ?? "");
    if (!source || !targetId.startsWith("slot:")) return;
    const start = Number(targetId.slice(5));
    if (!Number.isFinite(start)) return;
    if (source.data.kind === "task") scheduleTask(String(source.data.taskId), start);
    if (source.data.kind === "block") moveBlock(String(source.data.blockId), start - Number(source.data.segmentOffset ?? 0));
  };

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice, setNotice]);

  const shareSchedule = async () => {
    if (!userId || !dailyPlanId) {
      setNotice("공유 링크는 로그인 후 만들 수 있어요.");
      return;
    }
    setSharing(true);
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dailyPlanId }),
      });
      const result = await response.json() as { path?: string; error?: string };
      if (!response.ok || !result.path) throw new Error(result.error ?? "공유 링크를 만들지 못했어요.");
      const shareUrl = new URL(result.path, window.location.origin).toString();
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      } else if (navigator.share) {
        await navigator.share({ title: "Timebox 일정", text: "오늘의 타임박스 일정", url: shareUrl });
      } else {
        throw new Error("브라우저에서 링크 복사를 지원하지 않아요.");
      }
      setNotice("공유 링크를 복사했어요.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(error instanceof Error ? error.message : "공유 링크를 만들지 못했어요.");
    } finally {
      setSharing(false);
    }
  };

  const signOut = async () => {
    if (!userId) { setNotice("지금은 데모 모드예요."); return; }
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className="paper-app" data-mode={serviceMode}>
        <header className="paper-topbar">
          <Logo />
          <AppNav page={page} setPage={openPage} />
          <div className="paper-top-actions">
            <div className="service-mode-switch" aria-label="화면 모드 선택">
              <button data-active={serviceMode === "professional"} onClick={() => changeServiceMode("professional")} title="분리된 카드형 일잘러 모드"><BriefcaseBusiness size={14} /><span>일잘러</span></button>
              <button data-active={serviceMode === "paper"} onClick={() => changeServiceMode("paper")} title="손글씨 종이 플래너 모드"><NotebookPen size={14} /><span>종이</span></button>
            </div>
            <button onClick={shareSchedule} disabled={sharing}>{sharing ? <LoaderCircle className="spin" size={15} /> : <Copy size={15} />}<span>{sharing ? "생성 중" : "공유"}</span></button><button className="paper-avatar" onClick={signOut} title="로그아웃">J</button>
          </div>
        </header>
        {page === "today" && <TodayView todayLabel={todayLabel} />}
        {page === "journal" && <JournalView onOpenRecords={() => { setRecordsIntent("journal"); setPage("records"); }} />}
        {page === "records" && <RecordsView initialJournalSearch={recordsIntent === "journal"} />}
        <AppNav page={page} setPage={openPage} />
        {notice && <div className="toast" role="status"><CheckCircle2 size={17} /> {notice}<button onClick={() => setNotice(null)} aria-label="알림 닫기"><X size={15} /></button></div>}
        <DragOverlay className="drag-overlay" dropAnimation={null}>{(source) => <div className="drag-preview"><GripVertical size={15} /><span>{String(source.data.title ?? "타임블록")}</span></div>}</DragOverlay>
      </div>
    </DragDropProvider>
  );
}

export function TimeboxDashboard({ todayLabel, seed }: { todayLabel: string; seed: PlannerSeed }) {
  return <PlannerStoreProvider key={seed.dailyPlanId ?? seed.planDate} seed={seed}><TimeboxDashboardInner todayLabel={todayLabel} /></PlannerStoreProvider>;
}
