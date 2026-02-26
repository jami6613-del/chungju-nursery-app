import { supabase } from "../supabaseClient";

/**
 * 오늘의 할 일 / 내일의 할 일: 날짜별 한 줄씩 리스트.
 * 테이블이 없으면 프로젝트 루트의 supabase-daily_todos.sql 을 Supabase SQL Editor에서 실행하세요.
 */
export async function fetchDailyTodos(todoDate: string): Promise<string[]> {
  const { data } = await supabase
    .from("daily_todos")
    .select("lines")
    .eq("todo_date", todoDate)
    .maybeSingle();
  const lines = (data as { lines?: string[] } | null)?.lines;
  return Array.isArray(lines) ? lines : [];
}

export async function saveDailyTodos(
  todoDate: string,
  lines: string[],
  userId: string,
): Promise<void> {
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
