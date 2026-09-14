import { formatWatchSowingSummary, isWatchSowingData } from "./planSummary.js";

type Environment = Record<string, string | undefined>;

/** 쿠키나 사용자 로그인 토큰 대신, 범위가 제한된 워치 조회키만 받는다. */
export function createWatchHandler(env: Environment, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    const headers = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      "Vary": "Authorization",
    };
    const reply = (text: string, status: number) => new Response(text, { status, headers });
    if (request.method !== "GET") {
      const response = reply("GET 요청으로 조회해 주세요.", 405);
      response.headers.set("Allow", "GET");
      return response;
    }
    const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") || "");
    if (!match) return reply("조회 실패 · 단축어의 Authorization 헤더에 Bearer 조회키를 입력해 주세요.", 401);
    const url = env.VITE_SUPABASE_URL;
    const key = env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return reply("조회 실패 · 서버 연결 설정이 필요합니다. 육묘장 앱의 워치 연결 안내를 확인해 주세요.", 503);
    try {
      const rpcUrl = new URL("rest/v1/rpc/get_watch_sowing_data", url.replace(/\/$/, "") + "/");
      if (rpcUrl.protocol !== "https:") return reply("조회 실패 · 서버 연결 설정을 확인해 주세요.", 503);
      const response = await fetcher(rpcUrl, {
        method: "POST",
        headers: {
          apikey: key,
          ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_token: match[1] }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const code = (data as { code?: string } | null)?.code;
        if (code === "28000") return reply("조회 실패 · 조회키가 만료·해제되었거나 계정 승인이 해제되었습니다. 앱에서 워치를 다시 연결해 주세요.", 401);
        if (code === "PGRST202" || code === "42883") return reply("조회 실패 · 워치 기능의 최초 설정이 필요합니다. 앱의 워치 연결 안내를 확인해 주세요.", 503);
        return reply("조회 실패 · 파종 데이터를 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.", 502);
      }
      if (!isWatchSowingData(data)) return reply("조회 실패 · 응답 형식이 올바르지 않습니다. 앱의 워치 설정을 확인해 주세요.", 502);
      return reply(formatWatchSowingSummary(data), 200);
    } catch (error) {
      const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      return reply(timedOut ? "조회 시간 초과 · 통신 상태를 확인하고 다시 눌러 주세요." : "조회 실패 · 서버에 연결하지 못했습니다. 잠시 후 다시 눌러 주세요.", timedOut ? 504 : 502);
    }
  };
}
