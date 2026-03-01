-- orders 테이블에 야외경화 시작일(outdoor_hardening_at) 컬럼 추가 (Supabase SQL 에디터에서 실행)
-- 야외경화 N일째 벳지 표시에 사용됨.
-- outdoor_hardening 이 true인 기존 행은 이 SQL 실행 후, 앱에서 야외경화 취소 → 다시 야외경화 하면 날짜가 기록됨.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS outdoor_hardening_at date;
