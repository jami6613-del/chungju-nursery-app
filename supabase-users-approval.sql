-- 가입승인용 users 테이블 및 트리거 (Supabase SQL 에디터에서 실행)
-- 1) 테이블이 없다면 생성, 2) 새 가입자 자동 등록, 3) 최고관리자만 미승인 목록 조회/승인 가능하도록 RLS

-- 앱용 사용자 프로필 (id = auth.users.id)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  role_level SMALLINT NOT NULL DEFAULT 3,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 이메일 컬럼 있으면 목록에서 이메일 표시 가능 (선택)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;

-- 새 가입 시 자동으로 users에 행 추가 (이메일은 auth에서 복사)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, role_level, is_approved)
  VALUES (new.id, new.email, 3, false);
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- RLS: 본인 행은 읽기 가능, 최고관리자(role_level=0)는 전체 읽기 + is_approved 수정 가능
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_select_admin" ON public.users;
CREATE POLICY "users_select_admin" ON public.users FOR SELECT
  TO authenticated
  USING (
    (SELECT role_level FROM public.users WHERE id = auth.uid()) = 0
  );

DROP POLICY IF EXISTS "users_update_approval_by_admin" ON public.users;
CREATE POLICY "users_update_approval_by_admin" ON public.users FOR UPDATE
  TO authenticated
  USING ((SELECT role_level FROM public.users WHERE id = auth.uid()) = 0)
  WITH CHECK (true);

-- 기존 auth.users에 대응하는 users 행이 없다면 수동으로 추가해야 합니다.
-- 예: INSERT INTO public.users (id, email, role_level, is_approved) VALUES ('auth-user-uuid', 'admin@example.com', 0, true);
