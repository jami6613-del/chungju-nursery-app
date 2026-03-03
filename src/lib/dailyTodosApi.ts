import { supabase } from "../supabaseClient";

export interface DailyTodoItem {
  text: string;
  completed: boolean;
}

function normalizeLines(raw: unknown): DailyTodoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") return { text: item, completed: false };
    if (item && typeof item === "object" && "text" in item) {
      const o = item as { text?: unknown; completed?: unknown };
      return {
        text: typeof o.text === "string" ? o.text : "",
        completed: o.completed === true,
      };
    }
    return { text: "", completed: false };
  });
}

/**
 * 오늘의 할 일 / 내일의 할 일: 날짜별 리스트 (완료 여부 포함).
 * lines: [{ text, completed }] — completed true면 삭선 표시, 자정 넘기면 완료된 항목은 오늘로 넘어갈 때 제외.
 */
export async function fetchDailyTodos(todoDate: string): Promise<DailyTodoItem[]> {
  const { data } = await supabase
    .from("daily_todos")
    .select("lines")
    .eq("todo_date", todoDate)
    .maybeSingle();
  const raw = (data as { lines?: unknown } | null)?.lines;
  return normalizeLines(raw);
}

export async function saveDailyTodos(
  todoDate: string,
  items: DailyTodoItem[],
  userId: string,
): Promise<void> {
  const lines = items.filter((item) => item.text.trim() !== "").map(({ text, completed }) => ({ text, completed }));
  const { error } = await supabase.from("daily_todos").upsert(
    {
      todo_date: todoDate,
      lines,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "todo_date" },
  );
  if (error) throw new Error(error.message);
}
