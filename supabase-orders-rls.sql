-- orders 테이블 삭제 허용 (Supabase → SQL Editor에서 아래 3줄 실행)

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders delete" ON public.orders;
CREATE POLICY "orders delete" ON public.orders FOR DELETE TO authenticated USING (true);
