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
  Link2,
  LogOut,
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
  Target,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { dateInTimeZone, shiftIsoDate, startOfIsoWeek } from "@/lib/date";
import { createContext, FormEvent, useContext, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadRecordBundle, type ActivityKind, type RecordBundle } from "./records-data";
import { filterBrainDumpTasks, normalizeBrainDumpQuery } from "./brain-dump-search";
import { resolvePlannerDropIntent } from "./drag-drop-intent";
import { PENDING_PLAN_CHANGE_REASON, PlannerStoreProvider, usePlannerStore, type PlannerSeed } from "./store";
import { formatPlanTime, PLAN_END_HOUR } from "./planner-time";
import { tagSuggestions } from "./tag-utils";
import type { TagName, Task, TimeBlock } from "./types";

const ESTIMATE_OPTIONS = [15, 30, 45, 60, 90, 120, 180] as const;
const DAY_START_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12] as const;
const MOODS = [
  { label: "매우 힘듦", emoji: "😞" },
  { label: "힘듦", emoji: "😕" },
  { label: "보통", emoji: "😐" },
  { label: "좋음", emoji: "🙂" },
  { label: "아주 좋음", emoji: "😄" },
];

function moodEmoji(value: number | null | undefined) {
  return value ? MOODS[value - 1]?.emoji ?? "" : "";
}

type Page = "today" | "journal" | "records";
type ServiceMode = "professional" | "paper";
type RecordTab = "summary" | "activity";
type Period = "today" | "week" | "month" | "year" | "all";
type ShareLinkSummary = {
  id: string;
  dailyPlanId: string;
  planDate: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type ChangeReasonRequest = (title: string, description: string) => Promise<string | null>;
const ChangeReasonContext = createContext<ChangeReasonRequest | null>(null);

function useChangeReason() {
  const request = useContext(ChangeReasonContext);
  if (!request) throw new Error("변경 이유 입력창이 필요합니다.");
  return request;
}

async function reasonForChange(
  planStatus: "draft" | "committed" | "closed",
  isPlanEditing: boolean,
  request: ChangeReasonRequest,
  title: string,
  description: string,
) {
  if (planStatus !== "committed") return undefined;
  if (isPlanEditing) return PENDING_PLAN_CHANGE_REASON;
  return (await request(title, description)) ?? null;
}

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
  return formatPlanTime(totalMinutes);
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function minuteFromTimetablePosition(position: { x: number; y: number }) {
  const tracks = document.querySelectorAll<HTMLElement>(".hour-track[data-hour]");
  for (const track of tracks) {
    const rect = track.getBoundingClientRect();
    if (!rect.width || position.y < rect.top || position.y > rect.bottom || position.x < rect.left || position.x > rect.right) continue;
    const hour = Number(track.dataset.hour);
    if (!Number.isFinite(hour)) return null;
    const quarter = Math.max(0, Math.min(3, Math.floor(((position.x - rect.left) / rect.width) * 4)));
    return hour * 60 + quarter * 15;
  }
  return null;
}

function isOutsideTimetable(position: { x: number; y: number }) {
  const timetable = document.querySelector<HTMLElement>(".timetable-section");
  const rect = timetable?.getBoundingClientRect();
  if (!rect) return false;
  return position.x < rect.left || position.x > rect.right || position.y < rect.top || position.y > rect.bottom;
}

function dragEndPosition(event: DragEndEvent) {
  const nativeEvent = event.nativeEvent;
  if (nativeEvent && "clientX" in nativeEvent && "clientY" in nativeEvent) {
    const x = Number(nativeEvent.clientX);
    const y = Number(nativeEvent.clientY);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  return event.operation.position.current;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00`));
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}년 ${monthNumber}월`;
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthCalendarDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dates: Array<string | null> = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= dayCount; day += 1) {
    dates.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (dates.length % 7) dates.push(null);
  return dates;
}

function Logo() {
  return (
    <div className="paper-brand" aria-label="Timebox 홈">
      <span className="paper-brand-clock" aria-hidden="true"><span /></span>
      <span>TIMEBOX</span>
    </div>
  );
}

function CompactTask({ task, tagOptions, priority = false }: { task: Task; tagOptions: string[]; priority?: boolean }) {
  const blocks = usePlannerStore((state) => state.blocks);
  const planStatus = usePlannerStore((state) => state.planStatus);
  const isPlanEditing = usePlannerStore((state) => state.isPlanEditing);
  const setNotice = usePlannerStore((state) => state.setNotice);
  const toggleMit = usePlannerStore((state) => state.toggleMit);
  const scheduleTask = usePlannerStore((state) => state.scheduleTask);
  const updateTask = usePlannerStore((state) => state.updateTask);
  const discardTask = usePlannerStore((state) => state.discardTask);
  const requestChangeReason = useChangeReason();
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
    disabled: scheduled || planStatus === "closed" || (planStatus === "committed" && !isPlanEditing),
  });

  const save = async () => {
    const linkedBlock = blocks.find((block) => block.taskId === task.id);
    const estimateChanged = estimate !== task.estimate;
    if (linkedBlock && estimateChanged && planStatus === "committed" && !isPlanEditing) {
      setNotice("예상 시간을 바꾸려면 먼저 ‘계획 변경’을 눌러 주세요.");
      return;
    }
    const reason = linkedBlock && estimateChanged
      ? await reasonForChange(
        planStatus,
        isPlanEditing,
        requestChangeReason,
        "예상 시간을 바꾸는 이유",
        `‘${task.title}’ 작업을 ${formatDuration(task.estimate)}에서 ${formatDuration(estimate)}으로 바꾸는 이유를 남겨 주세요. 연결된 타임블록 크기도 함께 바뀌어요.`,
      )
      : undefined;
    if (reason === null) return;
    const updated = updateTask(task.id, { title, tag, estimate }, reason);
    if (updated) setEditing(false);
  };

  const addToSchedule = async () => {
    const reason = await reasonForChange(
      planStatus,
      isPlanEditing,
      requestChangeReason,
      "일정을 추가하는 이유",
      `‘${task.title}’ 작업을 확정된 일정에 추가하는 이유를 남겨 주세요.`,
    );
    if (reason === null) return;
    scheduleTask(task.id, undefined, reason);
  };

  const deleteTask = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!scheduled || planStatus !== "committed") {
      discardTask(task.id);
      return;
    }
    if (!isPlanEditing) {
      setNotice("일정을 삭제하려면 먼저 ‘계획 변경’을 눌러 주세요.");
      return;
    }
    discardTask(task.id, PENDING_PLAN_CHANGE_REASON);
  };

  if (editing) {
    const tagListId = `task-tags-${priority ? "priority" : "brain"}-${task.id}`;
    return (
      <div className="note-task-editor">
        <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="할 일 제목" autoFocus />
        <div>
          <label className="note-tag-field">
            <Tag size={12} />
            <input value={tag} onChange={(event) => setTag(event.target.value)} list={tagListId} maxLength={30} aria-label="태그" placeholder="태그 입력" />
          </label>
          <datalist id={tagListId}>{tagOptions.map((option) => <option key={option} value={option} />)}</datalist>
          <select value={estimate} onChange={(event) => setEstimate(Number(event.target.value))} aria-label="예상 시간" title={scheduled ? "연결된 타임블록 크기도 함께 바뀝니다." : undefined}>
            {ESTIMATE_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes}분</option>)}
          </select>
          <button onClick={save}><Check size={15} /> 저장</button>
          <button className="icon-only" onClick={() => setEditing(false)} aria-label="취소"><X size={15} /></button>
        </div>
        <div className="note-tag-choices" aria-label="저장된 태그 선택">
          {tagOptions.map((option) => <button type="button" key={option} data-active={option === tag} onClick={() => setTag(option)}>{option}</button>)}
        </div>
        <small className="note-tag-help">원하는 태그가 없으면 태그 입력칸에 새 이름을 직접 적어 저장하세요.</small>
      </div>
    );
  }

  return (
    <article ref={ref} className="note-task" data-dragging={isDragging} data-priority={priority} data-scheduled={scheduled}>
      <button ref={handleRef} className="note-drag" aria-label={`${task.title} 드래그`}><GripVertical size={15} /></button>
      <button className="note-star" data-active={task.isMit} onClick={() => toggleMit(task.id)} aria-label="선택한 날짜의 우선순위 전환">
        <Star size={15} fill={task.isMit ? "currentColor" : "none"} />
      </button>
      <button className="note-task-copy" onClick={addToSchedule} title={scheduled ? "이미 시간표에 배치됨" : planStatus === "closed" ? "이전 방식으로 잠긴 일정입니다" : planStatus === "committed" && !isPlanEditing ? "계획 변경 모드에서 배치할 수 있어요" : "빈 시간에 배치"} disabled={scheduled || planStatus === "closed" || (planStatus === "committed" && !isPlanEditing)}>
        <strong>{task.title}</strong>
        <span><Tag size={11} /> {task.tag} · {task.estimate}분{scheduled && <em>시간표에 배치됨</em>}</span>
      </button>
      <button className="icon-only note-edit" onClick={beginEditing} aria-label="할 일 수정"><Pencil size={14} /></button>
      {!priority && <button type="button" className="icon-only note-delete" onClick={deleteTask} aria-label={scheduled ? `${task.title} 할 일과 일정 함께 삭제` : `${task.title} 휴지통으로 이동`} title={scheduled ? "할 일과 연결된 타임블록 함께 삭제" : "할 일 삭제"}><Trash2 size={14} /></button>}
    </article>
  );
}

function AddTaskForm({ tagOptions }: { tagOptions: string[] }) {
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
        <label>
          <Tag size={13} />
          <input className="brain-tag-input" value={tag} onChange={(event) => setTag(event.target.value)} list="brain-tag-options" maxLength={30} aria-label="태그" placeholder="태그 입력" />
          <datalist id="brain-tag-options">{tagOptions.map((option) => <option key={option} value={option} />)}</datalist>
        </label>
        <label><Clock3 size={13} /><select value={estimate} onChange={(event) => setEstimate(Number(event.target.value))}>{ESTIMATE_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes}분 예상</option>)}</select></label>
      </div>
      <small className="brain-tag-help">태그 칸에 새 이름을 직접 입력하면 원하는 태그가 함께 저장돼요.</small>
    </form>
  );
}

function PrioritySection() {
  const tasks = usePlannerStore((state) => state.tasks);
  const availableTags = usePlannerStore((state) => state.availableTags);
  const priorities = tasks.filter((task) => task.isMit && !task.completed).slice(0, 3);
  const tagOptions = tagSuggestions([...availableTags, ...tasks.map((task) => task.tag)]);
  return (
    <section className="paper-section priority-note">
      <div className="paper-section-title"><span>TOP PRIORITIES</span><small>이날 가장 중요한 3가지</small></div>
      <div className="priority-list">
        {[0, 1, 2].map((index) => priorities[index]
          ? <div className="priority-line" key={priorities[index].id}><b>{index + 1}</b><CompactTask task={priorities[index]} tagOptions={tagOptions} priority /></div>
          : <div className="priority-empty" key={index}><b>{index + 1}</b><span>브레인덤프에서 별을 눌러 선택하세요</span></div>)}
      </div>
    </section>
  );
}

function BrainDumpSection() {
  const tasks = usePlannerStore((state) => state.tasks);
  const availableTags = usePlannerStore((state) => state.availableTags);
  const [query, setQuery] = useState("");
  const active = tasks.filter((task) => !task.completed);
  const filteredTasks = filterBrainDumpTasks(tasks, query);
  const searching = Boolean(normalizeBrainDumpQuery(query));
  const tagOptions = tagSuggestions([...availableTags, ...tasks.map((task) => task.tag)]);
  return (
    <section className="paper-section brain-note">
      <div className="paper-section-title"><span>BRAIN DUMP</span><small>{searching ? `검색 ${filteredTasks.length}/${active.length}` : `모든 생각 쏟아내기 · ${active.length}`}</small></div>
      <AddTaskForm tagOptions={tagOptions} />
      <label className="brain-search">
        <Search size={15} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="할 일이나 태그 검색" aria-label="브레인덤프 검색" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="브레인덤프 검색 지우기"><X size={15} /></button>}
      </label>
      <div className="brain-list">
        {filteredTasks.length ? filteredTasks.map((task) => <CompactTask key={task.id} task={task} tagOptions={tagOptions} />) : (
          <div className="brain-empty"><Inbox size={22} /><p>{searching ? "일치하는 할 일이나 태그가 없어요." : "완료하지 않은 일은 내일도 이곳에 남아요."}</p></div>
        )}
      </div>
    </section>
  );
}

function TimeSlot({ minutes, visible }: { minutes: number; visible: boolean }) {
  const planStatus = usePlannerStore((state) => state.planStatus);
  const isPlanEditing = usePlannerStore((state) => state.isPlanEditing);
  const { ref, isDropTarget } = useDroppable({ id: `slot:${minutes}`, disabled: planStatus === "closed" || (planStatus === "committed" && !isPlanEditing) });
  return <div ref={ref} className="quarter-slot" data-hidden={!visible} data-target={isDropTarget} aria-hidden={!visible} />;
}

function BlockSegment({ block, hour, isLast }: { block: TimeBlock; hour: number; isLast: boolean }) {
  const tasks = usePlannerStore((state) => state.tasks);
  const planStatus = usePlannerStore((state) => state.planStatus);
  const isPlanEditing = usePlannerStore((state) => state.isPlanEditing);
  const selectBlock = usePlannerStore((state) => state.selectBlock);
  const toggleBlockComplete = usePlannerStore((state) => state.toggleBlockComplete);
  const selectedBlockId = usePlannerStore((state) => state.selectedBlockId);
  const previewResizeBlock = usePlannerStore((state) => state.previewResizeBlock);
  const resizeBlock = usePlannerStore((state) => state.resizeBlock);
  const requestChangeReason = useChangeReason();
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
    disabled: planStatus === "closed" || (planStatus === "committed" && !isPlanEditing),
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
    const finish = async (pointerEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (pointerEvent.type === "pointercancel") {
        previewResizeBlock(block.id, originalDuration);
        return;
      }
      if (nextDuration !== originalDuration) {
        const reason = await reasonForChange(
          planStatus,
          isPlanEditing,
          requestChangeReason,
          "시간을 조정하는 이유",
          `‘${block.title}’ 블록을 ${formatDuration(originalDuration)}에서 ${formatDuration(nextDuration)}으로 바꾸는 이유를 남겨 주세요.`,
        );
        if (reason === null) {
          previewResizeBlock(block.id, originalDuration);
          return;
        }
        resizeBlock(block.id, nextDuration, originalDuration, reason);
      }
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
      {(planStatus === "draft" || isPlanEditing) && <button ref={handleRef} className="paper-block-drag" aria-label={`${block.title} 이동`} title="블록 몸통을 끌어서 이동"><GripVertical size={12} /></button>}
      <span className="paper-block-title">{first && isMit && <Star className="paper-block-mit" size={13} fill="currentColor" />}{block.title}</span>
      {isLast && planStatus !== "closed" && (
        <>
          <button className="paper-block-check" data-checked={block.status === "completed"} onClick={(event) => { event.stopPropagation(); toggleBlockComplete(block.id); }} aria-label="완료 전환">
            {block.status === "completed" && <Check size={11} />}
          </button>
          {(planStatus === "draft" || isPlanEditing) && <button className="paper-block-resize" onPointerDown={beginResize} aria-label={`${block.title} 길이 조절`} title="끌어서 시간 늘리기·줄이기"><span /></button>}
        </>
      )}
    </article>
  );
}

function SelectedBlockBar() {
  const blocks = usePlannerStore((state) => state.blocks);
  const planStatus = usePlannerStore((state) => state.planStatus);
  const isPlanEditing = usePlannerStore((state) => state.isPlanEditing);
  const selectedBlockId = usePlannerStore((state) => state.selectedBlockId);
  const resizeBlock = usePlannerStore((state) => state.resizeBlock);
  const updateActualMinutes = usePlannerStore((state) => state.updateActualMinutes);
  const addBufferAfter = usePlannerStore((state) => state.addBufferAfter);
  const toggleBlockComplete = usePlannerStore((state) => state.toggleBlockComplete);
  const removeBlock = usePlannerStore((state) => state.removeBlock);
  const requestChangeReason = useChangeReason();
  const [toolsOpen, setToolsOpen] = useState(false);
  const selected = blocks.find((block) => block.id === selectedBlockId);
  if (!selected) return null;
  const canChangeSchedule = planStatus === "draft" || isPlanEditing;
  const changed = selected.baselineStart !== undefined && (selected.start !== selected.baselineStart || selected.duration !== selected.baselineDuration);
  const changeDuration = async (duration: number) => {
    const reason = await reasonForChange(
      planStatus,
      isPlanEditing,
      requestChangeReason,
      "시간을 조정하는 이유",
      `‘${selected.title}’ 블록을 ${formatDuration(selected.duration)}에서 ${formatDuration(Math.max(15, duration))}으로 바꾸는 이유를 남겨 주세요.`,
    );
    if (reason === null) return;
    resizeBlock(selected.id, duration, undefined, reason);
  };
  const addBuffer = async () => {
    const reason = await reasonForChange(planStatus, isPlanEditing, requestChangeReason, "여유 시간을 추가하는 이유", `‘${selected.title}’ 다음에 15분 여유를 추가하는 이유를 남겨 주세요.`);
    if (reason === null) return;
    addBufferAfter(selected.id, reason);
  };
  const removeFromSchedule = async () => {
    const reason = await reasonForChange(planStatus, isPlanEditing, requestChangeReason, "일정에서 빼는 이유", `‘${selected.title}’ 블록을 확정된 일정에서 빼는 이유를 남겨 주세요.`);
    if (reason === null) return;
    removeBlock(selected.id, reason);
  };

  return (
    <div className="selected-block-bar" data-expanded={toolsOpen}>
      <div className="selected-block-summary"><strong>{selected.title}</strong><span>{formatTime(selected.start)}–{formatTime(selected.start + selected.duration)}</span></div>
      {changed && <span className="change-pill">변경됨</span>}
      {planStatus === "closed" ? (
        <span className="closed-pill"><CheckCircle2 size={13} /> 이전 일정 · 수정 잠김</span>
      ) : (
        <>
          <button className="complete-action" data-completed={selected.status === "completed"} onClick={() => toggleBlockComplete(selected.id)}><Check size={15} /> {selected.status === "completed" ? "완료됨" : "완료"}</button>
          <button className="selected-tools-toggle" data-open={toolsOpen} onClick={() => setToolsOpen((open) => !open)}>도구 <ChevronRight size={14} /></button>
          {toolsOpen && (
            <div className="selected-block-tools">
              {canChangeSchedule && <div className="resize-actions" aria-label="블록 크기 조정">
                <button onClick={() => changeDuration(selected.duration - 15)} aria-label="15분 줄이기"><Minus size={14} /></button>
                <b>{formatDuration(selected.duration)}</b>
                <button onClick={() => changeDuration(selected.duration + 15)} aria-label="15분 늘리기"><Plus size={14} /></button>
              </div>}
              <label className="actual-time">실제 <input type="number" min="5" step="5" value={selected.actualMinutes ?? selected.duration} onChange={(event) => updateActualMinutes(selected.id, Number(event.target.value))} />분</label>
              {canChangeSchedule && <button className="quiet-action" onClick={addBuffer}>+ 15분 여유</button>}
              {canChangeSchedule && <button className="remove-block-action" onClick={removeFromSchedule}><Trash2 size={14} /> 일정에서 빼기</button>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Timetable({ resolution }: { resolution: 15 | 30 }) {
  const blocks = usePlannerStore((state) => state.blocks);
  const dayStartHour = usePlannerStore((state) => state.dayStartHour);
  const earliestBlockHour = blocks.length ? Math.floor(Math.min(...blocks.map((block) => block.start)) / 60) : dayStartHour;
  const visibleStartHour = Math.min(dayStartHour, earliestBlockHour);
  const hours = Array.from({ length: PLAN_END_HOUR - visibleStartHour }, (_, index) => visibleStartHour + index);
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
              <div className="hour-track" data-hour={hour}>
                {[0, 15, 30, 45].map((offset) => <TimeSlot key={offset} minutes={hour * 60 + offset} visible={resolution === 15 || offset % 30 === 0} />)}
                {segments.map((block) => <BlockSegment key={block.id} block={block} hour={hour} isLast={block.start + block.duration <= (hour + 1) * 60} />)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="timetable-end"><time dateTime="01:00">1</time><span>다음 날 01:00 · 일정표 끝</span></div>
    </section>
  );
}

function TodayView({ todayLabel }: { todayLabel: string }) {
  const router = useRouter();
  const userId = usePlannerStore((state) => state.userId);
  const planDate = usePlannerStore((state) => state.planDate);
  const planStatus = usePlannerStore((state) => state.planStatus);
  const isPlanEditing = usePlannerStore((state) => state.isPlanEditing);
  const hasPendingPlanChanges = usePlannerStore((state) => state.hasPendingPlanChanges);
  const blocks = usePlannerStore((state) => state.blocks);
  const confirmPlan = usePlannerStore((state) => state.confirmPlan);
  const beginPlanEdit = usePlannerStore((state) => state.beginPlanEdit);
  const finishPlanEdit = usePlannerStore((state) => state.finishPlanEdit);
  const requestChangeReason = useChangeReason();
  const [resolution, setResolution] = useState<15 | 30>(30);
  const [notesOpen, setNotesOpen] = useState(true);
  const planned = blocks.reduce((sum, block) => sum + block.duration, 0);
  const today = dateInTimeZone();
  const openDate = (offset: number) => {
    router.push(`/?date=${shiftIsoDate(planDate, offset)}`);
  };
  const confirmPlanChanges = async () => {
    if (!hasPendingPlanChanges) {
      finishPlanEdit();
      return;
    }
    const reason = await requestChangeReason(
      "이번 일정 변경 이유",
      "이번 변경 모드에서 추가·이동·크기 조정·삭제한 일정 전체에 공통으로 남길 이유를 적어 주세요.",
    );
    if (!reason?.trim()) return;
    finishPlanEdit(reason);
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
            {userId && planDate === today && <button className="today-jump" onClick={() => router.push(`/?date=${shiftIsoDate(today, 1)}`)}>내일 계획</button>}
            {userId && planDate !== today && <button className="today-jump" onClick={() => router.push("/")}>오늘</button>}
          </div>
        </div>
        <div className="planner-heading-actions">
          <button className="notes-toggle" onClick={() => setNotesOpen((open) => !open)}>{notesOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}{notesOpen ? "할 일 숨기기" : "할 일 보기"}</button>
          <div className="resolution-switch"><span>눈금</span><button data-active={resolution === 30} onClick={() => setResolution(30)}>30분</button><button data-active={resolution === 15} onClick={() => setResolution(15)}>15분</button></div>
          {planStatus === "draft" ? (
            <button className="confirm-plan" onClick={confirmPlan}>계획 확정하기</button>
          ) : planStatus === "closed" ? (
            <span className="closed-pill"><CheckCircle2 size={13} /> 이전 방식으로 완료된 일정</span>
          ) : (
            <button className="plan-edit-toggle" data-editing={isPlanEditing} onClick={isPlanEditing ? confirmPlanChanges : beginPlanEdit}>
              {isPlanEditing ? <Check size={15} /> : <Pencil size={14} />} {isPlanEditing ? "변경 확정" : "계획 변경"}
            </button>
          )}
        </div>
      </div>
      <SelectedBlockBar />
      <div className="paper-planner" data-notes-open={notesOpen}>
        {notesOpen && <aside className="paper-notes"><PrioritySection /><BrainDumpSection /></aside>}
        <Timetable resolution={resolution} />
      </div>
      <p className="planner-help">미래 날짜도 미리 계획할 수 있어요. 확정 뒤 바뀐 내용은 ‘변경 확정’할 때 회고용 기록으로 정리됩니다.</p>
    </main>
  );
}

function JournalView() {
  const journal = usePlannerStore((state) => state.journal);
  const mood = usePlannerStore((state) => state.mood);
  const planDate = usePlannerStore((state) => state.planDate);
  const setJournal = usePlannerStore((state) => state.setJournal);
  const setMood = usePlannerStore((state) => state.setMood);
  const saveJournal = usePlannerStore((state) => state.saveJournal);
  const [saving, setSaving] = useState(false);
  const first = useRef(true);
  const saveSequence = useRef(0);

  const saveNow = () => {
    const sequence = ++saveSequence.current;
    setSaving(true);
    void Promise.all([
      saveJournal(),
      new Promise((resolve) => window.setTimeout(resolve, 450)),
    ]).finally(() => {
      if (saveSequence.current === sequence) setSaving(false);
    });
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const timeout = window.setTimeout(() => {
      const sequence = ++saveSequence.current;
      setSaving(true);
      void Promise.all([
        saveJournal(),
        new Promise((resolve) => window.setTimeout(resolve, 450)),
      ]).finally(() => {
        if (saveSequence.current === sequence) setSaving(false);
      });
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [journal, mood, saveJournal]);

  const insertPrompt = (prompt: string) => setJournal(`${journal}${journal.trim() ? "\n\n" : ""}${prompt}\n`);

  return (
    <main className="journal-page">
      <div className="journal-topline">
        <div><p>DAILY JOURNAL</p><h1>{dateLabel(planDate)}</h1></div>
        <div className="journal-save-indicator" data-saving={saving} title={saving ? "저장 중" : "저장 완료"} aria-label={saving ? "일기 저장 중" : "일기 저장 완료"}><Save size={17} /></div>
      </div>
      <div className="journal-sheet">
        <div className="mood-row" aria-label="오늘의 기분">
          <span>오늘의 기분</span>
          {MOODS.map(({ label, emoji }, index) => <button key={label} title={label} aria-label={label} data-active={mood === index + 1} onClick={() => setMood(index + 1)}>{emoji}</button>)}
        </div>
        <div className="journal-prompts">
          <span>막막하면 한 줄부터</span>
          {["오늘 잘한 일", "감사한 일", "기분이 좋았던 순간", "몰입했던 순간"].map((prompt) => <button key={prompt} onClick={() => insertPrompt(prompt)}>{prompt}</button>)}
        </div>
        <textarea value={journal} onChange={(event) => setJournal(event.target.value)} placeholder={"오늘은 어떤 하루였나요?\n계획과 달랐던 순간, 느낀 감정, 내일 기억하고 싶은 것을 자유롭게 적어보세요."} aria-label="오늘의 일기" />
        <footer><span>{journal.trim().length}자</span><button onClick={saveNow} disabled={saving}><Save size={15} /> 저장하기</button></footer>
      </div>
    </main>
  );
}

function cutoffFor(period: "week" | "year", today: string) {
  return period === "week" ? startOfIsoWeek(today) : shiftIsoDate(today, -364);
}

function activityIcon(kind: ActivityKind) {
  if (kind === "journal") return <BookOpenText size={15} />;
  if (kind === "schedule" || kind === "change") return <History size={15} />;
  return <CheckCircle2 size={15} />;
}

function MonthHistory({
  month,
  days,
  today,
  onOpen,
}: {
  month: string;
  days: RecordBundle["days"];
  today: string;
  onOpen: (date: string) => void;
}) {
  const dayByDate = new Map(days.map((day) => [day.date, day]));
  return (
    <div className="month-history">
      <div className="month-weekdays" aria-hidden="true">{["월", "화", "수", "목", "금", "토", "일"].map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
      <div className="month-days">
        {monthCalendarDates(month).map((date, index) => {
          if (!date) return <span className="month-day-empty" key={`empty-${index}`} />;
          const day = dayByDate.get(date);
          const completion = day?.totalBlocks ? Math.round(day.completedBlocks / day.totalBlocks * 100) : 0;
          if (!day) return <span className="month-day" data-future={date > today} key={date}><time>{Number(date.slice(-2))}</time></span>;
          return (
            <button className="month-day" data-today={date === today} onClick={() => onOpen(date)} aria-label={`${dateLabel(date)} 일정 열기`} key={date}>
              <time>{Number(date.slice(-2))}</time>
              <strong>{completion}%</strong>
              <i><span style={{ width: `${completion}%` }} /></i>
              <small>{day.journal.trim() && <BookOpenText size={10} />}{day.mood ? <b title={MOODS[day.mood - 1]?.label}>{moodEmoji(day.mood)}</b> : null}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChangeReasonDialog({
  title,
  description,
  value,
  onChange,
  onCancel,
  onSubmit,
}: {
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="reason-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="reason-dialog" role="dialog" aria-modal="true" aria-labelledby="change-reason-title">
        <header><div><History size={18} /><div><h2 id="change-reason-title">{title}</h2><p>{description}</p></div></div><button onClick={onCancel} aria-label="변경 이유 입력 취소"><X size={17} /></button></header>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          <label htmlFor="change-reason">변경 이유</label>
          <textarea id="change-reason" value={value} onChange={(event) => onChange(event.target.value)} maxLength={500} autoFocus placeholder="예: 예상보다 자료 검토가 더 필요해서 시간을 늘렸어요." />
          <small>{value.length}/500 · 변경을 확정하면 최초 계획과 달라진 내용에 함께 기록돼요.</small>
          <div><button type="button" className="reason-cancel" onClick={onCancel}>취소</button><button type="submit" className="reason-submit" disabled={!value.trim()}>이유 저장하고 변경</button></div>
        </form>
      </section>
    </div>
  );
}

function ShareManager({
  open,
  loading,
  creating,
  revokingId,
  now,
  demo,
  error,
  shares,
  onClose,
  onCreate,
  onRevoke,
}: {
  open: boolean;
  loading: boolean;
  creating: boolean;
  revokingId: string | null;
  now: number;
  demo: boolean;
  error: string;
  shares: ShareLinkSummary[];
  onClose: () => void;
  onCreate: () => void;
  onRevoke: (shareId: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="share-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="share-manager" role="dialog" aria-modal="true" aria-labelledby="share-manager-title">
        <header>
          <div><Link2 size={18} /><div><h2 id="share-manager-title">일정 공유 관리</h2><p>30일 동안 열 수 있는 읽기 전용 링크예요.</p></div></div>
          <button onClick={onClose} aria-label="공유 관리 닫기"><X size={17} /></button>
        </header>
        <button className="share-create" onClick={onCreate} disabled={creating || demo}>{creating ? <LoaderCircle className="spin" size={15} /> : <Copy size={15} />}{demo ? "로그인 후 링크 만들기" : creating ? "링크 만드는 중" : "현재 일정 새 링크 만들기"}</button>
        {error && <p className="share-error">{error}</p>}
        <div className="share-list">
          {loading ? <p className="share-empty">공유 링크를 불러오고 있어요…</p> : shares.length ? shares.map((share) => {
            const expired = Boolean(share.expiresAt && new Date(share.expiresAt).getTime() <= now);
            const active = !share.revokedAt && !expired;
            return (
              <article key={share.id} data-active={active}>
                <div className="share-date"><CalendarDays size={14} /><strong>{share.planDate ? dateLabel(share.planDate) : "일정"}</strong><span>{active ? "공유 중" : share.revokedAt ? "취소됨" : "만료됨"}</span></div>
                <p>생성 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(share.createdAt))}</p>
                {share.expiresAt && <p>만료 {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(share.expiresAt))}</p>}
                {active && !demo && <button className="share-revoke" onClick={() => onRevoke(share.id)} disabled={revokingId === share.id}>{revokingId === share.id ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />}공유 취소</button>}
              </article>
            );
          }) : <p className="share-empty">아직 만든 공유 링크가 없어요.</p>}
        </div>
        <footer>{demo ? "데모 미리보기예요. 로그인하면 실제 공유 링크를 만들고 여기서 취소할 수 있어요." : "보안을 위해 예전에 만든 링크 주소는 다시 표시하지 않아요. 다시 공유하려면 새 링크를 만들어 주세요."}</footer>
      </section>
    </div>
  );
}

function ProfilePanel({
  open,
  email,
  demo,
  tags,
  mode,
  dayStartHour,
  onClose,
  onAddTag,
  onModeChange,
  onDayStartHourChange,
  onSignOut,
}: {
  open: boolean;
  email: string | null;
  demo: boolean;
  tags: string[];
  mode: ServiceMode;
  dayStartHour: number;
  onClose: () => void;
  onAddTag: (name: string) => void;
  onModeChange: (mode: ServiceMode) => void;
  onDayStartHourChange: (hour: number) => void;
  onSignOut: () => void;
}) {
  const [tagName, setTagName] = useState("");

  if (!open) return null;
  return (
    <div className="profile-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header>
          <div><UserRound size={19} /><div><h2 id="profile-title">마이페이지</h2><p>계정과 내 태그, 화면 모드를 관리하세요.</p></div></div>
          <button onClick={onClose} aria-label="마이페이지 닫기"><X size={17} /></button>
        </header>
        <div className="profile-content">
          <section className="profile-account">
            <span>내 계정</span>
            <strong>{demo ? "데모 사용자" : email ?? "로그인 사용자"}</strong>
            <small>{demo ? "로그인하면 태그와 계획이 계정에 저장돼요." : "로그인된 이메일 계정"}</small>
          </section>
          <section className="profile-section">
            <div><Tag size={15} /><div><strong>내 태그</strong><small>여기서 추가한 태그는 할 일 수정 화면에서도 선택할 수 있어요.</small></div></div>
            <form className="profile-tag-form" onSubmit={(event) => {
              event.preventDefault();
              if (!tagName.trim()) return;
              onAddTag(tagName);
              setTagName("");
            }}>
              <input value={tagName} onChange={(event) => setTagName(event.target.value)} maxLength={30} aria-label="새 태그 이름" placeholder="예: 운동, 사이드 프로젝트" />
              <button type="submit" disabled={!tagName.trim()}><Plus size={14} />태그 추가</button>
            </form>
            <div className="profile-tags" aria-label="저장된 내 태그">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          </section>
          <section className="profile-section">
            <div><NotebookPen size={15} /><div><strong>화면 모드</strong><small>기기별로 마지막 선택을 기억해요.</small></div></div>
            <div className="profile-mode-switch">
              <button data-active={mode === "professional"} onClick={() => onModeChange("professional")}><BriefcaseBusiness size={14} />일잘러 모드</button>
              <button data-active={mode === "paper"} onClick={() => onModeChange("paper")}><NotebookPen size={14} />종이 모드</button>
            </div>
          </section>
          <section className="profile-section">
            <div><Clock3 size={15} /><div><strong>기상 시간 · 시간표 시작</strong><small>일정표는 선택한 시간부터 시작하고, 계정에 저장돼요.</small></div></div>
            <label className="profile-day-start">
              <span>하루 시작</span>
              <select value={dayStartHour} onChange={(event) => onDayStartHourChange(Number(event.target.value))} aria-label="기상 시간">
                {DAY_START_OPTIONS.map((hour) => <option key={hour} value={hour}>오전 {hour}시</option>)}
              </select>
            </label>
          </section>
        </div>
        <footer><button className="profile-signout" onClick={onSignOut}><LogOut size={15} />{demo ? "로그인 화면으로" : "로그아웃"}</button></footer>
      </section>
    </div>
  );
}

function demoRecords(planDate: string, tasks: Task[], blocks: TimeBlock[], journal: string, mood: number): RecordBundle {
  const tagMinutes = new Map<string, { plannedMinutes: number; actualMinutes: number }>();
  for (const block of blocks) {
    const task = tasks.find((item) => item.id === block.taskId);
    if (task) {
      const current = tagMinutes.get(task.tag) ?? { plannedMinutes: 0, actualMinutes: 0 };
      tagMinutes.set(task.tag, {
        plannedMinutes: current.plannedMinutes + block.duration,
        actualMinutes: current.actualMinutes + (block.actualMinutes ?? (block.status === "completed" ? block.duration : 0)),
      });
    }
  }
  const changedBlocks = blocks.filter((block) => block.baselineStart !== undefined && (block.start !== block.baselineStart || block.duration !== block.baselineDuration));
  const changeLines = changedBlocks.map((block) => {
    const details: string[] = [];
    if (block.baselineStart !== block.start) details.push(`시간 ${formatTime(block.baselineStart ?? block.start)} → ${formatTime(block.start)}`);
    if (block.baselineDuration !== block.duration) details.push(`길이 ${block.baselineDuration ?? block.duration}분 → ${block.duration}분`);
    return `• ${block.title} · ${details.join(" · ")}`;
  });
  const changeReason = changedBlocks.flatMap((block) => Object.values(block.changeReasons ?? {})).find(Boolean);
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
    tagMinutes: [...tagMinutes].map(([tag, minutes]) => ({ tag, date: planDate, ...minutes })),
    activities: [
      ...(changeLines.length ? [{
        id: "demo-change-group",
        occurredAt: `${planDate}T23:00:00+09:00`,
        date: planDate,
        kind: "change" as const,
        title: `계획에서 달라진 내용 ${changeLines.length}개`,
        detail: `${changeReason ? `변경 이유 · ${changeReason}` : "변경 이유가 기록되지 않았어요."}\n${changeLines.join("\n")}`,
      }] : []),
      ...blocks.map((block) => ({
        id: `demo-block-${block.id}`,
        occurredAt: `${planDate}T${formatTime(block.start)}:00+09:00`,
        date: planDate,
        kind: "schedule" as const,
        title: block.title,
        detail: `${formatTime(block.start)}–${formatTime(block.start + block.duration)} · 계획 ${block.duration}분${block.actualMinutes ? ` · 실제 ${block.actualMinutes}분` : ""}${block.status === "completed" ? " · 완료" : ""}`,
      })),
      ...tasks.map((task) => ({ id: `demo-task-${task.id}`, occurredAt: `${planDate}T09:00:00`, date: planDate, kind: "task" as const, title: task.title, detail: `${task.tag} · 예상 ${task.estimate}분${task.completed ? " · 완료" : ""}` })),
      ...(journal.trim() ? [{ id: "demo-journal", occurredAt: `${planDate}T22:00:00`, date: planDate, kind: "journal" as const, title: `${planDate} 일기`, detail: journal }] : []),
    ],
  };
}

function RecordsView({ onOpenRecord }: { onOpenRecord: (date: string, destination: "today" | "journal") => void }) {
  const userId = usePlannerStore((state) => state.userId);
  const planDate = usePlannerStore((state) => state.planDate);
  const tasks = usePlannerStore((state) => state.tasks);
  const blocks = usePlannerStore((state) => state.blocks);
  const journal = usePlannerStore((state) => state.journal);
  const mood = usePlannerStore((state) => state.mood);
  const [tab, setTab] = useState<RecordTab>("summary");
  const [period, setPeriod] = useState<Period>("month");
  const today = dateInTimeZone();
  const currentMonth = today.slice(0, 7);
  const currentWeekStart = startOfIsoWeek(today);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [weeklyGoalMinutes, setWeeklyGoalMinutes] = useState<number | null>(userId ? null : 600);
  const [weeklyGoalInput, setWeeklyGoalInput] = useState("10");
  const [weeklyGoalLoading, setWeeklyGoalLoading] = useState(Boolean(userId));
  const [weeklyGoalSaving, setWeeklyGoalSaving] = useState(false);
  const [weeklyGoalMessage, setWeeklyGoalMessage] = useState("");
  const [query, setQuery] = useState("");
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
    if (!userId) return;
    let active = true;
    fetch(`/api/goals/weekly?weekStart=${currentWeekStart}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { goal?: { targetMinutes: number } | null; error?: string };
        if (!response.ok) throw new Error(result.error ?? "주간 목표를 불러오지 못했어요.");
        if (!active) return;
        const target = result.goal?.targetMinutes ?? null;
        setWeeklyGoalMinutes(target);
        setWeeklyGoalInput(String((target ?? 600) / 60));
        setWeeklyGoalMessage("");
      })
      .catch((reason: unknown) => { if (active) setWeeklyGoalMessage(reason instanceof Error ? reason.message : "주간 목표를 불러오지 못했어요."); })
      .finally(() => { if (active) setWeeklyGoalLoading(false); });
    return () => { active = false; };
  }, [currentWeekStart, userId]);

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

  const isInPeriod = (date: string) => {
    if (period === "today") return date === today;
    if (date > today) return false;
    if (period === "month") return date.startsWith(selectedMonth);
    return period === "all" || date >= cutoffFor(period, today);
  };
  const days = bundle.days.filter((day) => isInPeriod(day.date));
  const activities = bundle.activities.filter((activity) => isInPeriod(activity.date));
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  const matches = (normalizedQuery ? bundle.activities : activities).filter((activity) => !normalizedQuery || `${activity.title} ${activity.detail} ${activity.date}`.toLocaleLowerCase("ko").includes(normalizedQuery));
  const changeActivities = activities.filter((activity) => activity.kind === "change");
  const planned = days.reduce((sum, day) => sum + day.plannedMinutes, 0);
  const actual = days.reduce((sum, day) => sum + day.actualMinutes, 0);
  const complete = days.reduce((sum, day) => sum + day.completedBlocks, 0);
  const total = days.reduce((sum, day) => sum + day.totalBlocks, 0);
  const changes = days.reduce((sum, day) => sum + day.changeCount, 0);
  const journalDays = days.filter((day) => day.journal.trim()).length;
  const tagMap = new Map<string, { plannedMinutes: number; actualMinutes: number }>();
  for (const item of bundle.tagMinutes.filter((item) => isInPeriod(item.date))) {
    const current = tagMap.get(item.tag) ?? { plannedMinutes: 0, actualMinutes: 0 };
    tagMap.set(item.tag, {
      plannedMinutes: current.plannedMinutes + item.plannedMinutes,
      actualMinutes: current.actualMinutes + item.actualMinutes,
    });
  }
  const tagTotals = [...tagMap].sort((a, b) => b[1].actualMinutes - a[1].actualMinutes || b[1].plannedMinutes - a[1].plannedMinutes);
  const maxTag = Math.max(1, ...tagTotals.flatMap(([, minutes]) => [minutes.plannedMinutes, minutes.actualMinutes]));
  const goalTarget = weeklyGoalMinutes ?? Math.round(Number(weeklyGoalInput || 10) * 60);
  const goalProgress = goalTarget > 0 ? Math.round(actual / goalTarget * 100) : 0;

  const saveWeeklyGoal = async () => {
    const hours = Number(weeklyGoalInput);
    const targetMinutes = Math.round(hours * 2) * 30;
    if (!Number.isFinite(hours) || targetMinutes < 60 || targetMinutes > 10080) {
      setWeeklyGoalMessage("목표는 1시간부터 168시간까지 30분 단위로 입력해 주세요.");
      return;
    }
    setWeeklyGoalSaving(true);
    setWeeklyGoalMessage("");
    if (!userId) {
      setWeeklyGoalMinutes(targetMinutes);
      setWeeklyGoalInput(String(targetMinutes / 60));
      setWeeklyGoalMessage("데모 목표를 바꿨어요.");
      setWeeklyGoalSaving(false);
      return;
    }
    try {
      const response = await fetch("/api/goals/weekly", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weekStart: currentWeekStart, targetMinutes }),
      });
      const result = await response.json() as { goal?: { targetMinutes: number }; error?: string };
      if (!response.ok || !result.goal) throw new Error(result.error ?? "주간 목표를 저장하지 못했어요.");
      setWeeklyGoalMinutes(result.goal.targetMinutes);
      setWeeklyGoalInput(String(result.goal.targetMinutes / 60));
      setWeeklyGoalMessage("이번 주 목표를 저장했어요.");
    } catch (reason) {
      setWeeklyGoalMessage(reason instanceof Error ? reason.message : "주간 목표를 저장하지 못했어요.");
    } finally {
      setWeeklyGoalSaving(false);
    }
  };

  return (
    <main className="records-page">
      <div className="records-heading"><div><p>ARCHIVE</p><h1>나의 기록</h1><span>일정, 일기, 변경 내역을 한곳에서 찾아보세요.</span></div></div>
      <div className="records-tools">
        <div className="record-tabs"><button data-active={tab === "summary"} onClick={() => setTab("summary")}><BarChart3 size={15} /> 요약 통계</button><button data-active={tab === "activity"} onClick={() => setTab("activity")}><History size={15} /> 활동 기록</button></div>
        <div className="period-control">
          <div className="period-tabs">{(["today", "week", "month", "year", "all"] as Period[]).map((item) => <button key={item} data-active={period === item} onClick={() => setPeriod(item)}>{item === "today" ? "오늘" : item === "week" ? "이번 주" : item === "month" ? "월별" : item === "year" ? "1년" : "전체"}</button>)}</div>
          {period === "month" && (
            <div className="month-navigation" aria-label="통계 월 선택">
              <button onClick={() => setSelectedMonth((month) => shiftMonth(month, -1))} aria-label="이전 달"><ChevronLeft size={14} /></button>
              <strong>{monthLabel(selectedMonth)}</strong>
              <button onClick={() => setSelectedMonth((month) => shiftMonth(month, 1))} aria-label="다음 달" disabled={selectedMonth >= currentMonth}><ChevronRight size={14} /></button>
            </div>
          )}
        </div>
        <label className="records-search"><Search size={16} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="할 일, 태그, 일기, 날짜 검색" /><kbd>⌘ K</kbd></label>
      </div>

      {loading && <div className="records-state">기록을 정리하고 있어요…</div>}
      {error && <div className="records-state error">{error}</div>}

      {query.trim() && (
        <section className="search-results"><header><Search size={16} /><strong>검색 결과 {matches.length}개</strong></header>{matches.length ? matches.slice(0, 30).map((activity) => <article key={activity.id}><span data-kind={activity.kind}>{activityIcon(activity.kind)}</span><div><time>{activity.date}</time><strong>{activity.title}</strong><p>{activity.detail}</p><button className="record-open" onClick={() => onOpenRecord(activity.date, activity.kind === "journal" ? "journal" : "today")}>{activity.kind === "journal" ? "이 일기 열기" : "이날 일정 열기"}<ChevronRight size={13} /></button></div></article>) : <p className="no-records">일정과 일기에서 일치하는 기록을 찾지 못했어요.</p>}</section>
      )}

      {!query.trim() && tab === "summary" && (
        <div className="records-summary">
          {period === "week" && (
            <section className="weekly-goal-card">
              <div className="weekly-goal-copy"><Target size={18} /><div><span>이번 주 집중 목표</span><strong>{formatDuration(actual)} <small>/ {formatDuration(goalTarget)}</small></strong><p>{dateLabel(currentWeekStart)}–{dateLabel(shiftIsoDate(currentWeekStart, 6))} · {weeklyGoalLoading ? "목표 불러오는 중" : `${goalProgress}% 달성`}</p></div></div>
              <div className="weekly-goal-progress"><span style={{ width: `${Math.min(100, goalProgress)}%` }} /></div>
              <div className="weekly-goal-form"><label>목표 <input type="number" min="1" max="168" step="0.5" value={weeklyGoalInput} onChange={(event) => setWeeklyGoalInput(event.target.value)} aria-label="주간 목표 시간" />시간</label><button onClick={saveWeeklyGoal} disabled={weeklyGoalSaving}>{weeklyGoalSaving ? <LoaderCircle className="spin" size={13} /> : <Save size={13} />}저장</button></div>
              {weeklyGoalMessage && <p className="weekly-goal-message">{weeklyGoalMessage}</p>}
            </section>
          )}
          <section className="summary-cards">
            <article><span>계획한 시간</span><strong>{formatDuration(planned)}</strong><small>{days.length}일의 기록</small></article>
            <article><span>실제 수행 시간</span><strong>{formatDuration(actual)}</strong><small>계획 대비 {planned ? Math.round(actual / planned * 100) : 0}%</small></article>
            <article><span>완료율</span><strong>{total ? Math.round(complete / total * 100) : 0}%</strong><small>{complete}/{total} 타임블록</small></article>
            <article><span>기록한 일기</span><strong>{journalDays}일</strong><small>일정 변경 {changes}회</small></article>
          </section>
          <div className="summary-grid">
            <section className="record-card"><header><div><Tag size={16} /><strong>태그별 계획·실제 시간</strong></div><small>실제 / 계획</small></header><div className="tag-bars">{tagTotals.length ? tagTotals.map(([tag, minutes]) => <div key={tag}><span>{tag}</span><i><b data-kind="planned" style={{ width: `${minutes.plannedMinutes / maxTag * 100}%` }} /><b data-kind="actual" style={{ width: `${minutes.actualMinutes / maxTag * 100}%` }} /></i><strong>{formatDuration(minutes.actualMinutes)}<small>/ {formatDuration(minutes.plannedMinutes)}</small></strong></div>) : <p className="no-records">아직 태그별 기록이 없어요.</p>}</div></section>
            <section className="record-card"><header><div><CalendarDays size={16} /><strong>{period === "month" ? "월간 기록 달력" : "날짜별 흐름"}</strong></div><small>{period === "month" ? monthLabel(selectedMonth) : "최근 기록"}</small></header>{period === "month" ? <MonthHistory month={selectedMonth} days={days} today={today} onOpen={(date) => onOpenRecord(date, "today")} /> : <div className="day-history">{days.length ? days.slice(0, 12).map((day) => <button key={day.date} onClick={() => onOpenRecord(day.date, "today")} aria-label={`${dateLabel(day.date)} 일정 열기`}><time>{dateLabel(day.date)}</time><div><span style={{ width: `${day.totalBlocks ? day.completedBlocks / day.totalBlocks * 100 : 0}%` }} /></div><strong>{day.totalBlocks ? Math.round(day.completedBlocks / day.totalBlocks * 100) : 0}%</strong>{day.journal && <BookOpenText size={13} />}<ChevronRight size={12} /></button>) : <p className="no-records">아직 날짜별 기록이 없어요.</p>}</div>}</section>
          </div>
        </div>
      )}

      {!query.trim() && tab === "activity" && (
        <section className="activity-feed change-feed">
          <header><div><History size={16} /><strong>최초 계획에서 달라진 내용</strong></div><p>확정 전 작성 과정은 제외하고, 변경 모드에서 확정한 차이와 이유만 보여줘요.</p></header>
          {changeActivities.length ? changeActivities.map((activity, index) => {
            const [reason, ...changeLines] = activity.detail.split("\n");
            return <article key={activity.id}><div className="activity-date">{index === 0 || changeActivities[index - 1].date !== activity.date ? dateLabel(activity.date) : ""}</div><span className="activity-icon" data-kind={activity.kind}>{activityIcon(activity.kind)}</span><div><time>{new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(activity.occurredAt))}</time><strong>{activity.title}</strong><div className="change-reason"><span>왜 바뀌었나요</span><p>{reason.replace(/^변경 이유 · /, "")}</p></div><ul className="change-lines">{changeLines.map((line) => <li key={line}>{line.replace(/^•\s*/, "")}</li>)}</ul><button className="record-open" onClick={() => onOpenRecord(activity.date, "today")}>이날 일정 열기<ChevronRight size={13} /></button></div></article>;
          }) : <p className="no-records">선택한 기간에는 확정 후 변경한 일정이 없어요.</p>}
        </section>
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

function TimeboxDashboardInner({ todayLabel, initialPage }: { todayLabel: string; initialPage: Page }) {
  const router = useRouter();
  const scheduleTask = usePlannerStore((state) => state.scheduleTask);
  const moveBlock = usePlannerStore((state) => state.moveBlock);
  const removeBlock = usePlannerStore((state) => state.removeBlock);
  const notice = usePlannerStore((state) => state.notice);
  const setNotice = usePlannerStore((state) => state.setNotice);
  const userId = usePlannerStore((state) => state.userId);
  const userEmail = usePlannerStore((state) => state.userEmail);
  const availableTags = usePlannerStore((state) => state.availableTags);
  const addTag = usePlannerStore((state) => state.addTag);
  const dayStartHour = usePlannerStore((state) => state.dayStartHour);
  const setDayStartHour = usePlannerStore((state) => state.setDayStartHour);
  const dailyPlanId = usePlannerStore((state) => state.dailyPlanId);
  const planDate = usePlannerStore((state) => state.planDate);
  const planStatus = usePlannerStore((state) => state.planStatus);
  const isPlanEditing = usePlannerStore((state) => state.isPlanEditing);
  const [page, setPage] = useState<Page>(initialPage);
  const serviceMode = useSyncExternalStore(subscribeServiceMode, getServiceModeSnapshot, () => "paper" as ServiceMode);
  const [sharing, setSharing] = useState(false);
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLinkSummary[]>([]);
  const [shareLinksLoading, setShareLinksLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [revokingShareId, setRevokingShareId] = useState<string | null>(null);
  const [shareManagerNow, setShareManagerNow] = useState(0);
  const [reasonPrompt, setReasonPrompt] = useState<{ title: string; description: string; resolve: (reason: string | null) => void } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const requestChangeReason: ChangeReasonRequest = (title, description) => new Promise((resolve) => {
    setReasonText("");
    setReasonPrompt({ title, description, resolve });
  });
  const finishReasonPrompt = (reason: string | null) => {
    const prompt = reasonPrompt;
    if (!prompt) return;
    setReasonPrompt(null);
    setReasonText("");
    prompt.resolve(reason?.trim() || null);
  };
  const openPage = (nextPage: Page) => {
    setPage(nextPage);
  };

  const openRecord = (date: string, destination: "today" | "journal") => {
    setPage(destination);
    if (!userId) return;
    const query = destination === "journal" ? `?date=${date}&view=journal` : `?date=${date}`;
    if (date !== planDate || destination === "journal") router.push(`/${query}`);
  };

  const changeServiceMode = (mode: ServiceMode) => {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new Event(MODE_CHANGE_EVENT));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (event.canceled) return;
    if (planStatus === "committed" && !isPlanEditing) return;
    const source = event.operation.source;
    const targetId = String(event.operation.target?.id ?? "");
    if (!source) return;
    const endPosition = dragEndPosition(event);
    const pointerStart = minuteFromTimetablePosition(endPosition);
    const targetStart = targetId.startsWith("slot:") ? Number(targetId.slice(5)) : null;
    const intent = resolvePlannerDropIntent(
      source.data.kind,
      pointerStart,
      targetStart,
      isOutsideTimetable(endPosition),
    );
    if (intent.type === "ignore") return;
    if (intent.type === "remove") {
      const reason = await reasonForChange(
        planStatus,
        isPlanEditing,
        requestChangeReason,
        "일정에서 빼는 이유",
        `‘${String(source.data.title ?? "타임블록")}’ 블록을 일정에서 빼는 이유를 남겨 주세요. 작업은 브레인덤프에 남아요.`,
      );
      if (reason !== null) removeBlock(String(source.data.blockId), reason);
      return;
    }
    const start = intent.start;
    if (source.data.kind === "task") {
      const reason = await reasonForChange(planStatus, isPlanEditing, requestChangeReason, "일정을 추가하는 이유", `‘${String(source.data.title ?? "작업")}’ 작업을 확정된 일정에 추가하는 이유를 남겨 주세요.`);
      if (reason !== null) scheduleTask(String(source.data.taskId), start, reason);
    }
    if (source.data.kind === "block") {
      const reason = await reasonForChange(planStatus, isPlanEditing, requestChangeReason, "시간을 옮기는 이유", `‘${String(source.data.title ?? "타임블록")}’ 블록의 시작 시간을 바꾸는 이유를 남겨 주세요.`);
      if (reason !== null) moveBlock(String(source.data.blockId), start - Number(source.data.segmentOffset ?? 0), reason);
    }
  };

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice, setNotice]);

  const openShareManager = async () => {
    const openedAt = Date.now();
    setShareManagerNow(openedAt);
    if (!userId) {
      setShareLinks([{
        id: "demo-share",
        dailyPlanId: "demo-plan",
        planDate,
        expiresAt: new Date(openedAt + 30 * 24 * 60 * 60 * 1000).toISOString(),
        revokedAt: null,
        createdAt: new Date(openedAt).toISOString(),
      }]);
      setShareError("");
      setSharePanelOpen(true);
      return;
    }
    if (!dailyPlanId) {
      setNotice("공유할 일정이 아직 없어요.");
      return;
    }
    setSharePanelOpen(true);
    setShareLinksLoading(true);
    setShareError("");
    try {
      const response = await fetch("/api/shares", { cache: "no-store" });
      const result = await response.json() as { shares?: ShareLinkSummary[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "공유 링크를 불러오지 못했어요.");
      setShareLinks(result.shares ?? []);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "공유 링크를 불러오지 못했어요.");
    } finally {
      setShareLinksLoading(false);
    }
  };

  useEffect(() => {
    if (!sharePanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSharePanelOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sharePanelOpen]);

  useEffect(() => {
    if (!profilePanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfilePanelOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [profilePanelOpen]);

  useEffect(() => {
    if (!reasonPrompt) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReasonPrompt(null);
        setReasonText("");
        reasonPrompt.resolve(null);
      }
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [reasonPrompt]);

  const shareSchedule = async () => {
    if (!dailyPlanId) return;
    setSharing(true);
    setShareError("");
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dailyPlanId }),
      });
      const result = await response.json() as { path?: string; id?: string; planDate?: string; expiresAt?: string; createdAt?: string; error?: string };
      if (!response.ok || !result.path) throw new Error(result.error ?? "공유 링크를 만들지 못했어요.");
      const shareUrl = new URL(result.path, window.location.origin).toString();
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      } else if (navigator.share) {
        await navigator.share({ title: "Timebox 일정", text: "오늘의 타임박스 일정", url: shareUrl });
      } else {
        throw new Error("브라우저에서 링크 복사를 지원하지 않아요.");
      }
      if (result.id && result.createdAt) {
        setShareLinks((shares) => [{
          id: result.id as string,
          dailyPlanId,
          planDate: result.planDate ?? planDate,
          expiresAt: result.expiresAt ?? null,
          revokedAt: null,
          createdAt: result.createdAt as string,
        }, ...shares]);
      }
      setNotice("공유 링크를 복사했어요.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "공유 링크를 만들지 못했어요.";
      setShareError(message);
      setNotice(message);
    } finally {
      setSharing(false);
    }
  };

  const revokeShare = async (shareId: string) => {
    setRevokingShareId(shareId);
    setShareError("");
    try {
      const response = await fetch(`/api/shares/${shareId}`, { method: "DELETE" });
      const result = await response.json() as { revokedAt?: string; error?: string };
      if (!response.ok || !result.revokedAt) throw new Error(result.error ?? "공유를 취소하지 못했어요.");
      setShareLinks((shares) => shares.map((share) => share.id === shareId ? { ...share, revokedAt: result.revokedAt as string } : share));
      setNotice("공유 링크를 취소했어요.");
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "공유를 취소하지 못했어요.");
    } finally {
      setRevokingShareId(null);
    }
  };

  const signOut = async () => {
    if (!userId) { window.location.href = "/login"; return; }
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) { setNotice("로그아웃하지 못했어요. 다시 시도해 주세요."); return; }
    window.location.href = "/login";
  };

  return (
    <ChangeReasonContext.Provider value={requestChangeReason}>
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
            <button onClick={openShareManager}><Copy size={15} /><span>공유</span></button><button className="paper-avatar" onClick={() => setProfilePanelOpen(true)} title="마이페이지" aria-label="마이페이지 열기">{userEmail?.slice(0, 1).toUpperCase() ?? (userId ? "나" : "D")}</button>
          </div>
        </header>
        {page === "today" && <TodayView todayLabel={todayLabel} />}
        {page === "journal" && <JournalView />}
        {page === "records" && <RecordsView onOpenRecord={openRecord} />}
        <AppNav page={page} setPage={openPage} />
        <ShareManager open={sharePanelOpen} loading={shareLinksLoading} creating={sharing} revokingId={revokingShareId} now={shareManagerNow} demo={!userId} error={shareError} shares={shareLinks} onClose={() => setSharePanelOpen(false)} onCreate={shareSchedule} onRevoke={revokeShare} />
        <ProfilePanel open={profilePanelOpen} email={userEmail} demo={!userId} tags={availableTags} mode={serviceMode} dayStartHour={dayStartHour} onClose={() => setProfilePanelOpen(false)} onAddTag={addTag} onModeChange={changeServiceMode} onDayStartHourChange={setDayStartHour} onSignOut={signOut} />
        {reasonPrompt && <ChangeReasonDialog title={reasonPrompt.title} description={reasonPrompt.description} value={reasonText} onChange={setReasonText} onCancel={() => finishReasonPrompt(null)} onSubmit={() => finishReasonPrompt(reasonText)} />}
        {notice && <div className="toast" role="status"><CheckCircle2 size={17} /> {notice}<button onClick={() => setNotice(null)} aria-label="알림 닫기"><X size={15} /></button></div>}
        <DragOverlay className="drag-overlay" dropAnimation={null}>{(source) => <div className="drag-preview"><GripVertical size={15} /><span>{String(source.data.title ?? "타임블록")}</span></div>}</DragOverlay>
      </div>
    </DragDropProvider>
    </ChangeReasonContext.Provider>
  );
}

export function TimeboxDashboard({
  todayLabel,
  seed,
  initialPage = "today",
}: {
  todayLabel: string;
  seed: PlannerSeed;
  initialPage?: Page;
}) {
  return <PlannerStoreProvider key={`${seed.dailyPlanId ?? seed.planDate}-${initialPage}`} seed={seed}><TimeboxDashboardInner todayLabel={todayLabel} initialPage={initialPage} /></PlannerStoreProvider>;
}
