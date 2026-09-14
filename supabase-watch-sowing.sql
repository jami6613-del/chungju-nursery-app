-- 최초 1회: 육묘장 Supabase 프로젝트의 SQL Editor에서 전체 실행.
-- 기존 주문/파종계획 및 RLS는 변경하지 않습니다.
BEGIN;

CREATE TABLE IF NOT EXISTS public.watch_sowing_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.watch_sowing_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.watch_sowing_tokens FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_watch_sowing_token()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_token text;
  v_expires timestamptz := now() + interval '1 year';
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_user AND is_approved = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = '승인된 계정으로 로그인해 주세요.';
  END IF;
  -- 독립적인 UUID 두 개: 244비트 난수. 원문은 이번 응답에서만 반환.
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.watch_sowing_tokens (user_id, token_hash, created_at, expires_at)
  VALUES (v_user, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now(), v_expires)
  ON CONFLICT (user_id) DO UPDATE SET
    token_hash = EXCLUDED.token_hash, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at;
  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_watch_sowing_token_status()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'active', EXISTS (
      SELECT 1 FROM public.watch_sowing_tokens t JOIN public.users u ON u.id = t.user_id
      WHERE t.user_id = auth.uid() AND t.expires_at > now() AND u.is_approved = true
    ),
    'expires_at', (SELECT t.expires_at FROM public.watch_sowing_tokens t WHERE t.user_id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.revoke_watch_sowing_token()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.watch_sowing_tokens WHERE user_id = auth.uid();
$$;

-- 날짜는 DB에서 Asia/Seoul로 고정. 임의 날짜/테이블을 지정하는 인자는 두지 않는다.
-- 반환 범위: 오늘/내일 파종계획의 표시용 6개 필드만. orders와 중복 합산하지 않는다.
CREATE OR REPLACE FUNCTION public.get_watch_sowing_data(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' OR NOT EXISTS (
    SELECT 1 FROM public.watch_sowing_tokens t JOIN public.users u ON u.id = t.user_id
    WHERE t.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
      AND t.expires_at > now() AND u.is_approved = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = '워치 조회키가 유효하지 않습니다.';
  END IF;
  RETURN jsonb_build_object(
    'today_date', v_today,
    'tomorrow_date', v_today + 1,
    'generated_at', now(),
    'today_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'orderer', COALESCE(p.orderer, ''), 'crop', COALESCE(p.crop, ''),
        'quantity', COALESCE(p.quantity, ''), 'tray_type', COALESCE(p.tray_type, ''),
        'tray_custom', COALESCE(p.tray_custom, ''),
        'seed_owner', CASE WHEN p.seed_owner = '주문자' THEN '주문자' ELSE '육묘장' END
      ) ORDER BY p.created_at, p.id)
      FROM public.sowing_plan_items p WHERE p.plan_date = v_today
    ), '[]'::jsonb),
    'tomorrow_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'quantity', COALESCE(p.quantity, ''), 'tray_type', COALESCE(p.tray_type, ''),
        'tray_custom', COALESCE(p.tray_custom, '')
      ) ORDER BY p.created_at, p.id)
      FROM public.sowing_plan_items p WHERE p.plan_date = v_today + 1
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_watch_sowing_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_watch_sowing_token_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_watch_sowing_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_watch_sowing_data(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_watch_sowing_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_watch_sowing_token_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_watch_sowing_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_watch_sowing_data(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
