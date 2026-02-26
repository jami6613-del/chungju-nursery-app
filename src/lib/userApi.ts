import { supabase } from "../supabaseClient";

/** 본인 닉네임(name)만 설정. RPC update_my_name 호출. */
export async function updateMyName(nickname: string): Promise<void> {
  const { error } = await supabase.rpc("update_my_name", { new_name: nickname.trim() });
  if (error) throw new Error(error.message);
}
