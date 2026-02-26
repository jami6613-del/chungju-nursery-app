-- 관리자가 사용자를 승인할 때 RPC로 처리 (Supabase SQL 에디터에서 실행)
-- RLS와 관계없이, "현재 로그인한 사람이 Lv0일 때만" is_approved와 role_level을 갱신합니다.

CREATE OR REPLACE FUNCTION public.approve_user_by_admin(
  target_user_id uuid,
  new_role_level smallint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT u.role_level FROM public.users u WHERE u.id = auth.uid()) IS DISTINCT FROM 0 THEN
    RETURN;
  END IF;
  UPDATE public.users
  SET is_approved = true, role_level = new_role_level
  WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_user_by_admin(uuid, smallint) TO authenticated;
