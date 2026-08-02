export type TagName = "자소서" | "면접" | "일상" | "메시지" | "성장" | "업무" | "미분류";

export type Task = {
  id: string;
  title: string;
  estimate: number;
  tag: TagName;
  color: "coral" | "violet" | "blue" | "amber" | "green" | "slate";
  energy: "낮음" | "보통" | "높음";
  isMit: boolean;
  completed: boolean;
};

export type BlockType = "task" | "buffer" | "appointment" | "planning";

export type TimeBlock = {
  id: string;
  taskId?: string;
  title: string;
  start: number;
  duration: number;
  actualMinutes?: number;
  type: BlockType;
  color: Task["color"];
  status: "scheduled" | "running" | "completed";
};

export type MobileView = "tasks" | "schedule" | "review";
