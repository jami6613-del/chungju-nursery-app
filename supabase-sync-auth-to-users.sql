-- auth.users에 있지만 public.users에 없는 계정을 한 번 동기화 (Supabase SQL 에디터에서 실행)
-- SECURITY DEFINER로 auth 스키마를 읽고 public.users에 넣습니다.

-- 1) 동기화 함수 생성 (한 번만 실행하면 됨)
CREATE OR REPLACE FUNCTION public.sync_auth_users_to_public()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  inserted_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT au.id, au.email
    FROM auth.users au
    WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id)
  LOOP
    INSERT INTO public.users (id, email, role_level, is_approved)
    VALUES (r.id, r.email, 3, false)
    ON CONFLICT (id) DO NOTHING;
    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$$;

-- 2) 동기화 실행 (몇 명이 추가되었는지 반환됨)
SELECT public.sync_auth_users_to_public() AS "추가된_승인대기_수";
