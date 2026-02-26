import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppUser } from "./types";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// 환경변수가 없을 때도 앱이 "하얀 화면"으로 죽지 않도록 더미 클라이언트를 제공합니다.
// 실제 호출이 일어나기 전에, UI에서 설정 안내 화면을 보여주는 방식으로 처리합니다.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (createClient("http://localhost", "public-anon-key") as SupabaseClient);

export async function fetchCurrentUser(): Promise<AppUser | null> {
  if (!isSupabaseConfigured) return null;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data, error: profileError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !data) return null;

  return {
    id: data.id,
    email: user.email,
    name: data.name ?? null,
    role_level: data.role_level ?? 3,
    is_approved: data.is_approved ?? false,
  };
}

