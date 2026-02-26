-- auth.users에는 있는데 public.users에 없는 사용자 수동 추가 (Supabase SQL 에디터에서 실행)
-- 가입 후 승인 대기 목록에 안 보일 때, 트리거가 안 돌았을 수 있으니 아래로 누락 분만 채움

INSERT INTO public.users (id, email, role_level, is_approved)
SELECT au.id, au.email, 3, false
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;
