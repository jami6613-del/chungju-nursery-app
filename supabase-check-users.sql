-- 1) auth.users에 jami6613@naver.com 있는지 확인 (Supabase SQL 에디터에서 실행)
-- 결과가 1행 나오면 가입은 된 상태입니다.
SELECT id, email, created_at
FROM auth.users
WHERE email = 'jami6613@naver.com';

-- 2) public.users에 그 계정이 있는지 확인
-- 결과가 0행이면 "승인 대기" 목록에 안 뜨는 이유가 됩니다.
SELECT id, email, is_approved, created_at
FROM public.users
WHERE email = 'jami6613@naver.com';
