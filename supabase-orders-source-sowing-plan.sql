-- 현황 반영 후 계획 내용/현황 날짜가 수정되어도 원본 계획을 식별한다.
-- 계획은 보존기간 후 삭제되므로 외래키 없이 원본 ID를 보관한다.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source_sowing_plan_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS orders_source_sowing_plan_id_unique
  ON public.orders (source_sowing_plan_id) WHERE source_sowing_plan_id IS NOT NULL;
NOTIFY pgrst, 'reload schema';
