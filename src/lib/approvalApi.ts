import { supabase } from "../supabaseClient";

export type PendingUser = {
  id: string;
  email: string | null;
  name: string | null;
  role_level: number;
  is_approved: boolean;
  created_at?: string;
};

/** 승인 대기 중인 사용자 목록 (최고관리자만 호출 가능, RPC로 RLS 우회) */
export async function fetchPendingApprovalUsers(): Promise<PendingUser[]> {
  const { data, error } = await supabase.rpc("get_pending_approval_users");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    email: (row.email as string) ?? null,
    name: (row.name as string) ?? null,
    role_level: (row.role_level as number) ?? 3,
    is_approved: (row.is_approved as boolean) ?? false,
    created_at: row.created_at as string | undefined,
  }));
}

/** 사용자 승인 (is_approved = true, role_level 지정). RPC로 처리해 RLS 영향 없이 반영합니다. */
export async function approveUser(userId: string, roleLevel: number): Promise<void> {
  const { error } = await supabase.rpc("approve_user_by_admin", {
    target_user_id: userId,
    new_role_level: roleLevel,
  });
  if (error) throw new Error(error.message);
}

/** 승인된 전체 직원 목록 (최고관리자만, 직원관리 메뉴용). RPC로 RLS 우회해 모든 승인 계정 조회 */
export type ApprovedUser = PendingUser;

export async function fetchApprovedUsers(): Promise<ApprovedUser[]> {
  const { data, error } = await supabase.rpc("get_approved_users");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    email: (row.email as string) ?? null,
    name: (row.name as string) ?? null,
    role_level: (row.role_level as number) ?? 3,
    is_approved: (row.is_approved as boolean) ?? true,
    created_at: row.created_at as string | undefined,
  }));
}
