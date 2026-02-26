-- 직원관리 메뉴에서 승인된 전체 직원 목록 조회 (Supabase SQL 에디터에서 실행)
-- RLS와 관계없이, "현재 로그인한 사람이 Lv0일 때만" is_approved = true 인 사용자 목록을 반환합니다.

CREATE OR REPLACE FUNCTION public.get_approved_users()
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
  WHERE u.is_approved = true
  ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_approved_users() TO authenticated;
