-- 관리자가 승인 대기 목록을 볼 수 있도록 RPC 추가 (Supabase SQL 에디터에서 실행)
-- RLS와 관계없이, "현재 로그인한 사람이 Lv0일 때만" 목록을 반환합니다.

CREATE OR REPLACE FUNCTION public.get_pending_approval_users()
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  role_level smallint,
  is_approved boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT u.role_level FROM public.users u WHERE u.id = auth.uid()) IS DISTINCT FROM 0 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT u.id, u.email, u.name, u.role_level, u.is_approved, u.created_at
  FROM public.users u
  WHERE u.is_approved = false
  ORDER BY u.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_approval_users() TO authenticated;
