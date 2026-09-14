import assert from "node:assert/strict";
import test from "node:test";
import { formatWatchSowingSummary, summarizePlanTrays, type PlanSummaryItem, type WatchSowingData } from "../src/lib/planSummary.js";
import { createWatchHandler } from "../src/lib/watchEndpoint.js";

const item = (overrides: Partial<PlanSummaryItem> = {}): PlanSummaryItem => ({
  orderer: "김농부", crop: "청상추", seed_owner: "주문자", quantity: "100+10", tray_type: "200", tray_custom: "", ...overrides,
});
const sample: WatchSowingData = {
  today_date: "2026-12-31", tomorrow_date: "2027-01-01", generated_at: "2026-12-31T04:25:00Z",
  today_items: [item()],
  tomorrow_items: [item({ quantity: "400+50" }), item({ tray_type: "128", quantity: "40+5" }), item({ tray_type: "406", quantity: "100+5" })],
};
const token = "a".repeat(64);
const env = { VITE_SUPABASE_URL: "https://example.supabase.co", VITE_SUPABASE_ANON_KEY: "public-test-key" };
const request = (auth = `Bearer ${token}`) => new Request("https://nursery.example/api/watch-summary", { headers: { Authorization: auth } });
const stub = (body: unknown, status = 200): typeof fetch => async () => Response.json(body, { status });

test("화이트보드와 같은 트레이 합계: 기본+추가, 직접입력, 미지정, 정수 처리", () => {
  assert.deepEqual(summarizePlanTrays([
    item({ quantity: "100+10" }), item({ tray_type: "직접입력", tray_custom: " 200 ", quantity: "20+2" }),
    item({ tray_type: "128", quantity: "40+5" }), item({ tray_type: "포트", quantity: "8+0.5" }),
    item({ tray_type: "", quantity: "3" }), item({ tray_type: "406", quantity: "" }),
  ]), [["128", 45], ["200", 132], ["미지정", 3], ["포트", 8]]);
});

test("요청된 다섯 항목과 내일 트레이 합계를 연말에도 하나의 텍스트로 표시", () => {
  const text = formatWatchSowingSummary(sample);
  for (const expected of ["오늘 파종 12/31", "김농부 · 청상추", "종자 주문자 · 200구", "수량 100+10", "내일 트레이 1/1", "200구 450개", "128구 45개", "406구 105개", "13:25"])
    assert.ok(text.includes(expected), expected);
  assert.equal(text.match(/김농부/g)?.length, 1);
});

test("빈 날과 입력 수량 없음은 구분하고 많은 오늘 항목도 누락하지 않는다", () => {
  const empty = formatWatchSowingSummary({ ...sample, today_items: [], tomorrow_items: [] });
  assert.match(empty, /예정된 파종 없음/); assert.match(empty, /파종계획 없음/);
  const invalid = formatWatchSowingSummary({ ...sample, tomorrow_items: [item({ quantity: "미정" })] });
  assert.match(invalid, /합산할 수량 없음/);
  const many = formatWatchSowingSummary({ ...sample, today_items: Array.from({ length: 60 }, (_, i) => item({ orderer: `농부${i}` })) });
  assert.match(many, /60건/); assert.match(many, /농부59/);
});

test("조회키 없는 요청, 로그인 JWT, URL에 넣은 조회키는 DB 호출 전에 거절", async () => {
  let calls = 0;
  const handler = createWatchHandler(env, async () => { calls++; throw new Error(); });
  for (const auth of ["", "Bearer login.jwt.token", "Bearer wrong-key"]) assert.equal((await handler(request(auth))).status, 401);
  assert.equal((await handler(new Request(`https://nursery.example/api/watch-summary?token=${token}`))).status, 401);
  assert.equal(calls, 0);
});

test("GET으로만 조회하고 응답은 한국어 plain text이며 캐시하지 않는다", async () => {
  const handler = createWatchHandler(env, async (url, init) => {
    assert.equal(String(url), "https://example.supabase.co/rest/v1/rpc/get_watch_sowing_data");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { p_token: token });
    assert.equal(init?.cache, "no-store");
    assert.ok(!JSON.stringify(init?.headers).includes(token));
    return Response.json(sample);
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/plain; charset=utf-8/);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.match(await response.text(), /200구 450개/);
  assert.equal((await handler(new Request(request(), { method: "POST" }))).status, 405);
});

test("만료/해제, SQL 미설치, 서버 실패, 잘못된 응답을 빈 파종으로 표시하지 않는다", async () => {
  const cases: [unknown, number, number][] = [
    [{ code: "28000" }, 403, 401], [{ code: "PGRST202" }, 404, 503], [{ code: "XX000" }, 500, 502],
    [{}, 200, 502], [{ ...sample, tomorrow_items: null }, 200, 502],
    [{ ...sample, tomorrow_date: "2026-12-31" }, 200, 502],
  ];
  for (const [body, upstream, expected] of cases) {
    const response = await createWatchHandler(env, stub(body, upstream))(request());
    assert.equal(response.status, expected);
    assert.match(await response.text(), /조회 실패/);
  }
  assert.equal((await createWatchHandler({}, stub(sample))(request())).status, 503);
  const timeout: typeof fetch = async () => { throw new DOMException("timeout", "TimeoutError"); };
  assert.equal((await createWatchHandler(env, timeout)(request())).status, 504);
});
