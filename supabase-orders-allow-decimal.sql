-- 추가판(quantity_extra), 파종수량(quantity_base) 소수점 허용 (Supabase SQL 에디터에서 실행)
-- 정수 컬럼이면 numeric으로 변경해 소수 입력 가능하게 함.

-- quantity_extra
ALTER TABLE public.orders
  ALTER COLUMN quantity_extra TYPE numeric USING quantity_extra::numeric;

-- quantity_base
ALTER TABLE public.orders
  ALTER COLUMN quantity_base TYPE numeric USING quantity_base::numeric;
