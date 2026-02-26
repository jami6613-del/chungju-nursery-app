-- 본인 닉네임(name)만 수정 가능한 RPC (Supabase SQL 에디터에서 실행)
-- 앱에서 닉네임 설정 시 호출

CREATE OR REPLACE FUNCTION public.update_my_name(new_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET name = NULLIF(TRIM(new_name), '')
  WHERE id = auth.uid();
END;
$$;

-- authenticated 사용자만 실행 가능
GRANT EXECUTE ON FUNCTION public.update_my_name(TEXT) TO authenticated;

-- (선택) 이미 있는 최고관리자(Lv0) 닉네임을 '정효조'로 설정하려면 아래에서 본인 id로 실행
-- UPDATE public.users SET name = '정효조' WHERE id = '여기에-auth-users-uuid-입력' AND role_level = 0;
