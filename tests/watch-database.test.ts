import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { isWatchSowingData, formatWatchSowingSummary } from "../src/lib/planSummary.js";

test("워치 SQL: 인증, 최소 데이터 범위, 재발급·만료·해제 및 타인 키 보호", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const alice = "11111111-1111-4111-a111-111111111111";
  const bob = "22222222-2222-4222-a222-222222222222";
  const pending = "33333333-3333-4333-a333-333333333333";
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.users(id uuid PRIMARY KEY, is_approved boolean NOT NULL);
    CREATE TABLE public.sowing_plan_items(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_date date, created_at timestamptz DEFAULT now(),
      orderer text, crop text, quantity text, tray_type text, tray_custom text, seed_owner text,
      created_by uuid, private_note text
    );
    INSERT INTO auth.users VALUES ('${alice}'), ('${bob}'), ('${pending}');
    INSERT INTO public.users VALUES ('${alice}', true), ('${bob}', true), ('${pending}', false);
    INSERT INTO public.sowing_plan_items(plan_date, orderer, crop, quantity, tray_type, seed_owner, private_note)
    VALUES ((now() AT TIME ZONE 'Asia/Seoul')::date, '김농부', '청상추', '100+10', '200', '주문자', '노출 금지'),
      ((now() AT TIME ZONE 'Asia/Seoul')::date + 1, '내일 주문자', '케일', '400+50', '200', '육묘장', '노출 금지'),
      ((now() AT TIME ZONE 'Asia/Seoul')::date + 2, '모레 주문자', '들깨', '999', '406', '육묘장', '노출 금지'),
      ((now() AT TIME ZONE 'Asia/Seoul')::date - 1, '어제 주문자', '들깨', '999', '406', '육묘장', '노출 금지');
  `);
  const migration = readFileSync("supabase-watch-sowing.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration); // 다시 실행해도 기존 설치를 손상하지 않는다.

  const as = async (role: "anon" | "authenticated", user = "") => {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]);
    await db.exec(`SET ROLE ${role}`);
  };
  const issue = async () => (await db.query<{ result: { token: string; expires_at: string } }>("SELECT public.create_watch_sowing_token() AS result")).rows[0].result;
  const read = async (token: string | null) => (await db.query<{ result: unknown }>("SELECT public.get_watch_sowing_data($1) AS result", [token])).rows[0].result;
  const denied = async (fn: () => Promise<unknown>, code: string) => assert.rejects(fn, (e: unknown) => (e as { code: string }).code === code);

  await t.test("익명·미승인 계정 발급 차단 및 토큰 테이블 직접 접근 차단", async () => {
    await as("anon"); await denied(issue, "42501");
    await denied(() => read(null), "28000");
    await denied(() => read("a".repeat(64)), "28000");
    await denied(() => db.query("SELECT * FROM public.watch_sowing_tokens"), "42501");
    await as("authenticated", pending); await denied(issue, "42501");
    await as("authenticated", alice);
    await denied(() => db.query("SELECT * FROM public.watch_sowing_tokens"), "42501");
    await denied(() => db.query("DELETE FROM public.watch_sowing_tokens"), "42501");
  });

  await as("authenticated", alice);
  let aliceKey = (await issue()).token;
  assert.match(aliceKey, /^[a-f0-9]{64}$/);
  await t.test("오늘 다섯 항목, 내일 합산용 정보만 반환하고 다른 날짜·비고는 제외", async () => {
    await as("anon");
    const data = await read(aliceKey);
    assert.ok(isWatchSowingData(data));
    assert.equal(data.today_items.length, 1); assert.equal(data.tomorrow_items.length, 1);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    assert.equal(data.today_date, today);
    assert.deepEqual(Object.keys(data.tomorrow_items[0]).sort(), ["quantity", "tray_custom", "tray_type"]);
    const raw = JSON.stringify(data);
    for (const hidden of ["노출 금지", "내일 주문자", "모레 주문자", "어제 주문자", "created_by", "token_hash"]) assert.ok(!raw.includes(hidden));
    assert.match(formatWatchSowingSummary(data), /200구 450개/);
  });

  await t.test("원문 대신 해시 저장, 타인 조회키 재발급·해제에 영향 없음", async () => {
    await db.exec("RESET ROLE");
    const saved = (await db.query<{ token_hash: string }>("SELECT token_hash FROM public.watch_sowing_tokens WHERE user_id = $1", [alice])).rows[0].token_hash;
    assert.notEqual(saved, aliceKey); assert.match(saved, /^[a-f0-9]{64}$/);
    await as("authenticated", bob);
    const own = await issue();
    const ownStatus = (await db.query<{ result: { active: boolean } }>("SELECT public.get_watch_sowing_token_status() AS result")).rows[0].result;
    assert.equal(ownStatus.active, true);
    await db.query("SELECT public.revoke_watch_sowing_token()");
    await as("anon"); await denied(() => read(own.token), "28000");
    assert.ok(isWatchSowingData(await read(aliceKey)));
  });

  await t.test("재발급하면 이전 키 즉시 차단", async () => {
    await as("authenticated", alice);
    const previous = aliceKey; aliceKey = (await issue()).token;
    assert.notEqual(previous, aliceKey);
    await as("anon"); await denied(() => read(previous), "28000");
    assert.ok(isWatchSowingData(await read(aliceKey)));
  });

  await t.test("계정 승인 취소, 만료, 연결 해제 시 즉시 차단", async () => {
    await db.exec("RESET ROLE");
    await db.query("UPDATE public.users SET is_approved = false WHERE id = $1", [alice]);
    await as("anon"); await denied(() => read(aliceKey), "28000");
    await db.exec("RESET ROLE");
    await db.query("UPDATE public.users SET is_approved = true WHERE id = $1", [alice]);
    await db.query("UPDATE public.watch_sowing_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1", [alice]);
    await as("anon"); await denied(() => read(aliceKey), "28000");
    await as("authenticated", alice); aliceKey = (await issue()).token;
    await db.query("SELECT public.revoke_watch_sowing_token()");
    await as("anon"); await denied(() => read(aliceKey), "28000");
  });
});
