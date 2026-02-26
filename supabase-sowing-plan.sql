-- 주문 및 파종계획 관리용 테이블 (Supabase SQL 에디터에서 실행)

-- 미처리 주문 (반영 전 보관) - 먼저 생성 (sowing_plan_items가 참조)
CREATE TABLE IF NOT EXISTS unprocessed_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reflected_at TIMESTAMPTZ,
  reflected_plan_date DATE
);

-- 일자별 파종계획
CREATE TABLE IF NOT EXISTS sowing_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date DATE NOT NULL,
  orderer TEXT NOT NULL DEFAULT '',
  crop TEXT NOT NULL DEFAULT '',
  quantity TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_unprocessed_id UUID REFERENCES unprocessed_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_sowing_plan_items_plan_date ON sowing_plan_items(plan_date);

-- 기존 테이블에 created_by_email 없으면 추가 (이미 있으면 무시)
ALTER TABLE unprocessed_orders ADD COLUMN IF NOT EXISTS created_by_email TEXT;
ALTER TABLE unprocessed_orders ADD COLUMN IF NOT EXISTS created_by_role_level SMALLINT;
ALTER TABLE unprocessed_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- RLS: 인증된 사용자만 읽기/쓰기 (필요시 역할별 제한 추가)
ALTER TABLE sowing_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE unprocessed_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sowing_plan_items select" ON sowing_plan_items;
CREATE POLICY "sowing_plan_items select" ON sowing_plan_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sowing_plan_items insert" ON sowing_plan_items;
CREATE POLICY "sowing_plan_items insert" ON sowing_plan_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sowing_plan_items update" ON sowing_plan_items;
CREATE POLICY "sowing_plan_items update" ON sowing_plan_items FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "sowing_plan_items delete" ON sowing_plan_items;
CREATE POLICY "sowing_plan_items delete" ON sowing_plan_items FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "unprocessed_orders select" ON unprocessed_orders;
CREATE POLICY "unprocessed_orders select" ON unprocessed_orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "unprocessed_orders insert" ON unprocessed_orders;
CREATE POLICY "unprocessed_orders insert" ON unprocessed_orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "unprocessed_orders update" ON unprocessed_orders;
CREATE POLICY "unprocessed_orders update" ON unprocessed_orders FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "unprocessed_orders delete" ON unprocessed_orders;
CREATE POLICY "unprocessed_orders delete" ON unprocessed_orders FOR DELETE TO authenticated USING (true);

-- FK from sowing_plan_items to unprocessed_orders: create unprocessed_orders first, so we need to add the FK after.
-- Already referenced above; if creation order fails, run unprocessed_orders block first then sowing_plan_items without the FK, then: ALTER TABLE sowing_plan_items ADD CONSTRAINT ...
-- For clean run: create unprocessed_orders first (no refs), then sowing_plan_items with source_unprocessed_id UUID REFERENCES unprocessed_orders(id).
