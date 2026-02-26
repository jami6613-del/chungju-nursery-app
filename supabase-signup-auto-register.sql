-- 가입 시 자동으로 public.users에 등록되게 설정 (Supabase SQL 에디터에서 한 번 실행)
-- 실행 후: 새로 가입하는 사람은 자동으로 승인 대기 목록에 뜨고, 이미 가입한 사람 중 빠진 분은 한 번만 채워짐

-- 1) public.users 테이블·컬럼 확인
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  role_level SMALLINT NOT NULL DEFAULT 3,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;

-- 2) 새 가입자(auth.users INSERT) 시 public.users에 자동 삽입하는 함수
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
EXCEPTION
  WHEN unique_violation THEN
    RETURN new;
END;
$$;

-- 3) auth.users에 트리거 연결 (있으면 제거 후 다시 생성)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 4) 이미 가입했는데 public.users에 없는 사람 한 번만 채우기 (이미 있으면 무시)
INSERT INTO public.users (id, email, role_level, is_approved)
SELECT au.id, au.email, 3, false
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;
