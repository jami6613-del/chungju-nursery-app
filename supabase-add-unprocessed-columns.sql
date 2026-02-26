-- unprocessed_orders 테이블에 필요한 컬럼 추가 (한 번만 실행)
-- Supabase 대시보드 → SQL 에디터 → 새 쿼리 → 아래 붙여넣기 → Run

ALTER TABLE unprocessed_orders ADD COLUMN IF NOT EXISTS created_by_email TEXT;
ALTER TABLE unprocessed_orders ADD COLUMN IF NOT EXISTS created_by_role_level SMALLINT;
ALTER TABLE unprocessed_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
