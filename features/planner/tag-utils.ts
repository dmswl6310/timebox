import type { TaskColor } from "./types";

export const DEFAULT_TAGS = ["미분류", "업무", "일상", "자소서", "면접", "메시지", "성장"] as const;

const defaultColors: Record<string, TaskColor> = {
  미분류: "slate",
  업무: "blue",
  일상: "blue",
  자소서: "coral",
  면접: "violet",
  메시지: "amber",
  성장: "green",
};

const customPalette: TaskColor[] = ["violet", "coral", "green", "amber", "blue"];

export function normalizeTagName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 30) || "미분류";
}

export function colorForTag(value: string): TaskColor {
  const tag = normalizeTagName(value);
  const defaultColor = defaultColors[tag];
  if (defaultColor) return defaultColor;

  let hash = 0;
  for (const character of tag) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return customPalette[hash % customPalette.length];
}

export function savedTagColor(value: string | undefined, tag: string): TaskColor {
  return customPalette.includes(value as TaskColor) || value === "slate"
    ? value as TaskColor
    : colorForTag(tag);
}

export function tagSuggestions(tags: string[]) {
  return [...new Set([...DEFAULT_TAGS, ...tags.map(normalizeTagName)])];
}
