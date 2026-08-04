import type { Task } from "./types";

export function normalizeBrainDumpQuery(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko");
}

export function filterBrainDumpTasks(tasks: Task[], query: string) {
  const activeTasks = tasks.filter((task) => !task.completed);
  const normalizedQuery = normalizeBrainDumpQuery(query);

  if (!normalizedQuery) return activeTasks;

  const terms = normalizedQuery.split(" ");

  return activeTasks.filter((task) => {
    const searchableText = `${task.title} ${task.tag}`.toLocaleLowerCase("ko");
    return terms.every((term) => searchableText.includes(term));
  });
}
