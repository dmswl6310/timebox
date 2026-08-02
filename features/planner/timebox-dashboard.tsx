"use client";

import {
  DragDropProvider,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BatteryMedium,
  BookOpenText,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Copy,
  GripVertical,
  Inbox,
  ListTodo,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Star,
  Target,
  TimerReset,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePlannerStore } from "./store";
import type { Task, TimeBlock } from "./types";

const DAY_START = 8 * 60;
const DAY_END = 20 * 60;
const PX_PER_MINUTE = 1.18;
const CALENDAR_HEIGHT = (DAY_END - DAY_START) * PX_PER_MINUTE;

const colorLabels: Record<Task["color"], string> = {
  coral: "코랄",
  violet: "보라",
  blue: "파랑",
  amber: "노랑",
  green: "초록",
  slate: "회색",
};

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function Logo() {
  return (
    <div className="brand" aria-label="Timebox 홈">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>TIMEBOX</span>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const toggleMit = usePlannerStore((state) => state.toggleMit);
  const scheduleTask = usePlannerStore((state) => state.scheduleTask);
  const discardTask = usePlannerStore((state) => state.discardTask);
  const { ref, handleRef, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { kind: "task", taskId: task.id, title: task.title },
  });

  return (
    <article ref={ref} className="task-card" data-dragging={isDragging}>
      <button
        ref={handleRef}
        className="drag-handle"
        aria-label={`${task.title} 드래그`}
        title="일정으로 드래그"
      >
        <GripVertical size={16} />
      </button>
      <div className="task-card-main">
        <div className="task-title-row">
          <strong>{task.title}</strong>
          <button
            className="star-button"
            data-active={task.isMit}
            onClick={() => toggleMit(task.id)}
            aria-label={task.isMit ? "핵심 업무에서 제외" : "핵심 업무로 선택"}
          >
            <Star size={16} fill={task.isMit ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="task-meta">
          <span className={`tag-chip tag-${task.color}`}>
            <i /> {task.tag}
          </span>
          <span>
            <Clock3 size={13} /> {task.estimate}분
          </span>
          <span className="energy-label">
            <BatteryMedium size={13} /> {task.energy}
          </span>
        </div>
      </div>
      <div className="task-actions">
        <button
          className="schedule-task-button"
          onClick={() => scheduleTask(task.id)}
          aria-label={`${task.title} 일정에 배치`}
          title="빈 시간에 배치"
        >
          <Plus size={15} />
        </button>
        <button
          className="task-more"
          onClick={() => discardTask(task.id)}
          aria-label={`${task.title} 휴지통으로 이동`}
          title="휴지통으로 이동"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

function BrainDumpPanel() {
  const tasks = usePlannerStore((state) => state.tasks);
  const blocks = usePlannerStore((state) => state.blocks);
  const addTask = usePlannerStore((state) => state.addTask);
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState("전체");
  const activeTasks = tasks.filter((task) => !task.completed);
  const visibleTasks = activeTasks.filter(
    (task) => filter === "전체" || task.tag === filter,
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    addTask(value);
    setValue("");
  }

  return (
    <section className="workspace-panel task-panel" aria-label="브레인덤프">
      <div className="panel-heading">
        <div>
          <div className="eyebrow"><Inbox size={14} /> Brain dump</div>
          <h2>머릿속을 모두 꺼내세요</h2>
        </div>
        <span className="count-badge">{activeTasks.length}</span>
      </div>

      <form className="quick-add" onSubmit={submit}>
        <Plus size={17} />
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="할 일, 아이디어, 메시지..."
          aria-label="브레인덤프 할 일 입력"
        />
        <kbd>Enter</kbd>
      </form>

      <div className="filter-row" aria-label="태그 필터">
        {["전체", "자소서", "면접", "일상"].map((item) => (
          <button key={item} data-active={filter === item} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
        <button className="filter-more" aria-label="더 많은 태그">
          <MoreHorizontal size={15} />
        </button>
      </div>

      <div className="task-list">
        {visibleTasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>

      <div className="drop-hint">
        <GripVertical size={15} />
        <span>카드를 일정으로 끌거나 <b>＋</b> 버튼을 누르세요</span>
      </div>
      <div className="panel-footer-note">
        <CheckCircle2 size={15} /> 완료한 일은 브레인덤프에서 자동으로 정리돼요
      </div>
    </section>
  );
}

function MitStrip() {
  const tasks = usePlannerStore((state) => state.tasks);
  const mitTasks = tasks.filter((task) => task.isMit && !task.completed);

  return (
    <div className="mit-strip">
      <div className="mit-label">
        <span><Target size={15} /> 오늘의 Big 3</span>
        <b>{mitTasks.length}/3</b>
      </div>
      <div className="mit-items">
        {[0, 1, 2].map((index) => {
          const task = mitTasks[index];
          return task ? (
            <div className={`mit-item mit-${task.color}`} key={task.id}>
              <span>{index + 1}</span>
              <strong>{task.title}</strong>
              <small>{task.estimate}분</small>
            </div>
          ) : (
            <div className="mit-item empty" key={index}>
              <span>{index + 1}</span>
              <strong>핵심 업무를 선택하세요</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarBlock({ block }: { block: TimeBlock }) {
  const selectBlock = usePlannerStore((state) => state.selectBlock);
  const selectedBlockId = usePlannerStore((state) => state.selectedBlockId);
  const toggleBlockComplete = usePlannerStore((state) => state.toggleBlockComplete);
  const { ref, handleRef, isDragging } = useDraggable({
    id: `block:${block.id}`,
    data: { kind: "block", blockId: block.id, title: block.title },
  });

  const top = (block.start - DAY_START) * PX_PER_MINUTE;
  const height = Math.max(block.duration * PX_PER_MINUTE - 3, 28);
  const compact = block.duration <= 15;

  return (
    <article
      ref={ref}
      className={`calendar-block block-${block.color} type-${block.type}`}
      data-selected={selectedBlockId === block.id}
      data-complete={block.status === "completed"}
      data-running={block.status === "running"}
      data-dragging={isDragging}
      style={{ top, height }}
      onClick={() => selectBlock(block.id)}
    >
      <button
        ref={handleRef}
        className="block-drag-handle"
        aria-label={`${block.title} 시간 이동`}
      >
        <GripVertical size={14} />
      </button>
      <button
        className="block-check"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          toggleBlockComplete(block.id);
        }}
        aria-label={block.status === "completed" ? "완료 취소" : "완료 표시"}
      >
        {block.status === "completed" ? <Check size={13} /> : <Circle size={12} />}
      </button>
      <div className="block-copy">
        <strong>{block.title}</strong>
        {!compact && (
          <span>
            {formatTime(block.start)}–{formatTime(block.start + block.duration)}
            {block.actualMinutes ? ` · 실제 ${block.actualMinutes}분` : ""}
          </span>
        )}
      </div>
      {block.status === "running" && <span className="live-pill">진행 중</span>}
    </article>
  );
}

function ScheduleCanvas({
  canvasRef,
  currentMinutes,
}: {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  currentMinutes: number;
}) {
  const blocks = usePlannerStore((state) => state.blocks);
  const { ref, isDropTarget } = useDroppable({
    id: "calendar",
    data: { kind: "calendar" },
  });
  const hours = Array.from({ length: 13 }, (_, index) => 8 + index);
  const showCurrentLine = currentMinutes >= DAY_START && currentMinutes <= DAY_END;

  const setRefs = (node: HTMLDivElement | null) => {
    ref(node);
    canvasRef.current = node;
  };

  return (
    <div className="schedule-scroll">
      <div className="time-axis" style={{ height: CALENDAR_HEIGHT }} aria-hidden="true">
        {hours.map((hour) => (
          <span key={hour} style={{ top: (hour * 60 - DAY_START) * PX_PER_MINUTE }}>
            {hour.toString().padStart(2, "0")}:00
          </span>
        ))}
      </div>
      <div
        ref={setRefs}
        className="schedule-canvas"
        data-drop-target={isDropTarget}
        style={{ height: CALENDAR_HEIGHT }}
      >
        {showCurrentLine && (
          <div
            className="current-time-line"
            style={{ top: (currentMinutes - DAY_START) * PX_PER_MINUTE }}
          >
            <span>{formatTime(currentMinutes)}</span>
          </div>
        )}
        {blocks
          .slice()
          .sort((a, b) => a.start - b.start)
          .map((block) => (
            <CalendarBlock key={block.id} block={block} />
          ))}
      </div>
    </div>
  );
}

function PlannerPanel({
  todayLabel,
  currentMinutes,
  canvasRef,
}: {
  todayLabel: string;
  currentMinutes: number;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <main className="workspace-panel planner-panel" aria-label="오늘의 일정">
      <div className="planner-heading">
        <div>
          <div className="eyebrow"><CalendarDays size={14} /> Today</div>
          <div className="date-title-row">
            <button aria-label="이전 날짜"><ArrowLeft size={17} /></button>
            <h1>{todayLabel}</h1>
            <button aria-label="다음 날짜"><ArrowRight size={17} /></button>
          </div>
        </div>
        <div className="view-controls">
          <button className="today-button">오늘</button>
          <button className="zoom-button">15분 <ChevronDown size={14} /></button>
        </div>
      </div>
      <MitStrip />
      <ScheduleCanvas canvasRef={canvasRef} currentMinutes={currentMinutes} />
    </main>
  );
}

function FocusPanel() {
  const blocks = usePlannerStore((state) => state.blocks);
  const selectedBlockId = usePlannerStore((state) => state.selectedBlockId);
  const toggleBlockComplete = usePlannerStore((state) => state.toggleBlockComplete);
  const updateActualMinutes = usePlannerStore((state) => state.updateActualMinutes);
  const addBufferAfter = usePlannerStore((state) => state.addBufferAfter);
  const journal = usePlannerStore((state) => state.journal);
  const setJournal = usePlannerStore((state) => state.setJournal);
  const mood = usePlannerStore((state) => state.mood);
  const setMood = usePlannerStore((state) => state.setMood);
  const [tab, setTab] = useState<"focus" | "review">("focus");
  const [timerRunning, setTimerRunning] = useState(false);

  const selected = blocks.find((block) => block.id === selectedBlockId) ?? blocks[0];
  const plannedMinutes = blocks.reduce((sum, block) => sum + block.duration, 0);
  const completedMinutes = blocks
    .filter((block) => block.status === "completed")
    .reduce((sum, block) => sum + (block.actualMinutes ?? block.duration), 0);
  const completionRate = Math.round((completedMinutes / Math.max(plannedMinutes, 1)) * 100);

  return (
    <aside className="workspace-panel focus-panel" aria-label="실행과 회고">
      <div className="focus-tabs">
        <button data-active={tab === "focus"} onClick={() => setTab("focus")}>
          <Play size={14} /> 실행
        </button>
        <button data-active={tab === "review"} onClick={() => setTab("review")}>
          <BookOpenText size={14} /> 회고
        </button>
      </div>

      {tab === "focus" ? (
        <>
          <div className="now-card">
            <div className="now-card-label">
              <span className="pulse-dot" /> 선택한 타임박스
              <button aria-label="더 보기"><MoreHorizontal size={16} /></button>
            </div>
            <span className={`focus-color color-${selected.color}`}>
              {colorLabels[selected.color]}
            </span>
            <h2>{selected.title}</h2>
            <p>첫 행동: 문서를 열고 가장 어색한 문장 하나에 밑줄 긋기</p>
            <div className="timer-display">
              <strong>{timerRunning ? "18:42" : formatDuration(selected.duration)}</strong>
              <span>{timerRunning ? "남은 시간" : "계획 시간"}</span>
            </div>
            <button
              className="primary-focus-button"
              onClick={() => setTimerRunning((running) => !running)}
            >
              {timerRunning ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
              {timerRunning ? "잠시 멈추기" : "이 타임박스 시작"}
            </button>
            <button
              className="complete-block-button"
              onClick={() => toggleBlockComplete(selected.id)}
            >
              {selected.status === "completed" ? <RotateCcw size={16} /> : <Check size={16} />}
              {selected.status === "completed" ? "완료 취소" : "작업 완료"}
            </button>
          </div>

          <div className="actual-time-card">
            <div>
              <span>실제 걸린 시간</span>
              <small>계획 {selected.duration}분</small>
            </div>
            <div className="stepper">
              <button
                onClick={() => updateActualMinutes(selected.id, (selected.actualMinutes ?? selected.duration) - 5)}
                aria-label="실제 시간 5분 줄이기"
              >−</button>
              <strong>{selected.actualMinutes ?? selected.duration}분</strong>
              <button
                onClick={() => updateActualMinutes(selected.id, (selected.actualMinutes ?? selected.duration) + 5)}
                aria-label="실제 시간 5분 늘리기"
              >＋</button>
            </div>
          </div>

          <button className="buffer-button" onClick={() => addBufferAfter(selected.id)}>
            <TimerReset size={16} /> 뒤에 15분 버퍼 추가
          </button>

          <div className="pace-card">
            <div className="card-title-row">
              <div>
                <span className="eyebrow"><BarChart3 size={14} /> Today&apos;s pace</span>
                <h3>오늘의 페이스</h3>
              </div>
              <strong>{Math.min(completionRate, 100)}%</strong>
            </div>
            <div className="progress-track"><span style={{ width: `${Math.min(completionRate, 100)}%` }} /></div>
            <div className="pace-stats">
              <span><b>{formatDuration(plannedMinutes)}</b> 계획</span>
              <span><b>{formatDuration(completedMinutes)}</b> 완료</span>
              <span><b>8분</b> 절약</span>
            </div>
          </div>

          <div className="coach-note">
            <Sparkles size={17} />
            <div><strong>충분히 좋은 기준을 정하세요</strong><p>공유할 수 있을 만큼 유용하면, 일단 완성입니다.</p></div>
          </div>
        </>
      ) : (
        <div className="review-pane">
          <div className="review-heading">
            <div className="eyebrow"><BookOpenText size={14} /> Evening review</div>
            <h2>오늘을 가볍게 돌아봐요</h2>
            <p>잘한 일과 다음에 바꿀 한 가지만 남겨도 충분해요.</p>
          </div>
          <div className="mood-picker">
            <span>오늘 기분은?</span>
            <div>
              {["😣", "😕", "😐", "🙂", "🤩"].map((emoji, index) => (
                <button
                  key={emoji}
                  data-active={mood === index + 1}
                  onClick={() => setMood(index + 1)}
                  aria-label={`기분 ${index + 1}점`}
                >{emoji}</button>
              ))}
            </div>
          </div>
          <label className="journal-field">
            <span>오늘의 기록</span>
            <textarea value={journal} onChange={(event) => setJournal(event.target.value)} />
          </label>
          <div className="reflection-prompts">
            <button><CheckCircle2 size={16} /> 오늘 잘한 일</button>
            <button><MessageCircle size={16} /> 방해받은 순간</button>
            <button><Target size={16} /> 내일의 첫 행동</button>
          </div>
          <button className="save-review-button"><Check size={17} /> 오늘 회고 저장</button>
        </div>
      )}
    </aside>
  );
}

function PlanningRibbon() {
  return (
    <div className="planning-ribbon">
      <div className="ribbon-copy">
        <span><Sparkles size={15} /> 15분 계획 루틴</span>
        <strong>일정을 배치하고 있어요</strong>
      </div>
      <ol>
        <li data-done="true"><span><Check size={13} /></span>브레인덤프</li>
        <li data-done="true"><span><Check size={13} /></span>Big 3</li>
        <li data-active="true"><span>3</span>시간 배치</li>
        <li><span>4</span>계획 확정</li>
      </ol>
      <button><Check size={16} /> 계획 확정하기</button>
    </div>
  );
}

function MobileNav() {
  const mobileView = usePlannerStore((state) => state.mobileView);
  const setMobileView = usePlannerStore((state) => state.setMobileView);
  return (
    <nav className="mobile-nav" aria-label="모바일 화면 전환">
      <button data-active={mobileView === "tasks"} onClick={() => setMobileView("tasks")}>
        <ListTodo size={19} /> 할 일
      </button>
      <button data-active={mobileView === "schedule"} onClick={() => setMobileView("schedule")}>
        <CalendarDays size={19} /> 일정
      </button>
      <button data-active={mobileView === "review"} onClick={() => setMobileView("review")}>
        <BookOpenText size={19} /> 회고
      </button>
    </nav>
  );
}

export function TimeboxDashboard({
  todayLabel,
  currentMinutes,
}: {
  todayLabel: string;
  currentMinutes: number;
}) {
  const scheduleTask = usePlannerStore((state) => state.scheduleTask);
  const moveBlock = usePlannerStore((state) => state.moveBlock);
  const mobileView = usePlannerStore((state) => state.mobileView);
  const notice = usePlannerStore((state) => state.notice);
  const setNotice = usePlannerStore((state) => state.setNotice);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.canceled || event.operation.target?.id !== "calendar") return;
    const source = event.operation.source;
    const rect = canvasRef.current?.getBoundingClientRect();
    const nativeEvent = event.nativeEvent as Event & { clientY?: number };
    if (!source || !rect || typeof nativeEvent.clientY !== "number") return;

    const rawMinutes = DAY_START + (nativeEvent.clientY - rect.top) / PX_PER_MINUTE;
    const snappedStart = Math.round(rawMinutes / 15) * 15;

    if (source.data.kind === "task") scheduleTask(String(source.data.taskId), snappedStart);
    if (source.data.kind === "block") moveBlock(String(source.data.blockId), snappedStart);
  };

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [notice, setNotice]);

  const shareSchedule = async () => {
    const shareUrl = `${window.location.origin}/?share=today`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("공유 링크를 복사했어요.");
    } catch {
      setNotice("공유 링크를 만들었어요.");
    }
  };

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className="app-shell">
        <header className="topbar">
          <Logo />
          <nav className="desktop-nav" aria-label="주요 메뉴">
            <button data-active="true"><CalendarDays size={16} /> 오늘</button>
            <button><BarChart3 size={16} /> 인사이트</button>
          </nav>
          <div className="topbar-actions">
            <button className="icon-button mobile-menu" aria-label="메뉴"><Menu size={19} /></button>
            <button className="share-button" onClick={shareSchedule}><Copy size={16} /> 일정 공유</button>
            <button className="icon-button" aria-label="설정"><Settings size={18} /></button>
            <button className="avatar-button" aria-label="프로필">J</button>
          </div>
        </header>

        <PlanningRibbon />

        <div className="workspace-grid" data-mobile-view={mobileView}>
          <BrainDumpPanel />
          <PlannerPanel todayLabel={todayLabel} currentMinutes={currentMinutes} canvasRef={canvasRef} />
          <FocusPanel />
        </div>

        <MobileNav />

        {notice && (
          <div className="toast" role="status">
            <CheckCircle2 size={17} /> {notice}
            <button onClick={() => setNotice(null)} aria-label="알림 닫기"><X size={15} /></button>
          </div>
        )}

        <DragOverlay className="drag-overlay">
          {(source) => (
            <div className="drag-preview">
              <GripVertical size={15} />
              <span>{String(source.data.title ?? "타임블록")}</span>
            </div>
          )}
        </DragOverlay>
      </div>
    </DragDropProvider>
  );
}
