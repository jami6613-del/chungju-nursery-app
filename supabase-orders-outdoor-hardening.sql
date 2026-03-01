-- orders 테이블에 야외경화(outdoor_hardening) 컬럼 추가 (Supabase SQL 에디터에서 실행)
-- 야외경화 상태로 지정한 작물을 저장하기 위해 필요함.
-- 메인메뉴로 나갔다 들어와도 야외경화 상태가 유지되도록 함.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS outdoor_hardening boolean DEFAULT false;
