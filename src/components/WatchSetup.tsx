import React from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabaseClient";

type TokenStatus = { active: boolean; expires_at: string | null };
const buttonStyle = "min-h-11 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 disabled:opacity-40";

function setupError(error: { code?: string; message?: string }): string {
  if (["PGRST202", "42883", "42P01"].includes(error.code || "")) {
    return "워치 기능의 최초 설정이 필요합니다. 아래 관리자용 설정 안내를 확인해 주세요.";
  }
  return "연결 정보를 불러오지 못했습니다. 로그인·통신 상태를 확인하고 다시 시도해 주세요.";
}

export function WatchSetup({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = React.useState<TokenStatus | null>(null);
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [preview, setPreview] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const endpoint = `${window.location.origin}/api/watch-summary`;
  const authHeader = token ? `Bearer ${token}` : "";

  const loadStatus = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await supabase.rpc("get_watch_sowing_token_status");
      if (result.error) throw result.error;
      if (!result.data || typeof result.data.active !== "boolean") throw new Error("Invalid status");
      setStatus(result.data as TokenStatus);
    } catch (e) {
      setStatus(null);
      setError(setupError(e as { code?: string }));
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { void loadStatus(); }, [loadStatus]);
  React.useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    titleRef.current?.focus();
    return () => { previousFocus?.focus(); };
  }, []);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, a[href], summary") || []).filter(el => el.getClientRects().length > 0);
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [onClose, busy]);

  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setMessage("복사했습니다."); }
    catch { setMessage("자동 복사가 안 되면 입력칸을 길게 눌러 전체 선택 후 복사해 주세요."); }
  };

  const issueToken = async () => {
    setBusy(true); setError(""); setMessage(""); setPreview("");
    try {
      const result = await supabase.rpc("create_watch_sowing_token");
      if (result.error) throw result.error;
      if (!/^[a-f0-9]{64}$/.test(result.data?.token || "")) throw new Error("Invalid token");
      setToken(result.data.token);
      setStatus({ active: true, expires_at: result.data.expires_at });
      setMessage("조회키를 발급했습니다. 이 창을 닫기 전에 단축어에 복사해 주세요.");
    } catch (e) { setError(setupError(e as { code?: string })); }
    finally { setBusy(false); }
  };

  const revokeToken = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("revoke_watch_sowing_token");
      if (result.error) throw result.error;
      setToken(""); setPreview(""); setStatus({ active: false, expires_at: null });
      setMessage("워치 연결을 해제했습니다. 기존 조회키는 사용할 수 없습니다.");
    } catch (e) { setError(setupError(e as { code?: string })); }
    finally { setBusy(false); }
  };

  const testSummary = async () => {
    setBusy(true); setError(""); setPreview("");
    try {
      const response = await fetch(endpoint, {
        headers: { Authorization: authHeader }, cache: "no-store", signal: AbortSignal.timeout(15000),
      });
      if (!response.headers.get("content-type")?.includes("text/plain")) {
        throw new Error("요약 주소가 아직 배포되지 않았습니다. 변경사항 배포 후 다시 확인해 주세요.");
      }
      const text = await response.text();
      if (!response.ok) throw new Error(text);
      setPreview(text); setMessage("현재 파종 정보를 가져왔습니다.");
    } catch (e) {
      setError(e instanceof Error && !["TypeError", "TimeoutError", "AbortError"].includes(e.name)
        ? e.message : "요약을 불러오지 못했습니다. 통신 상태를 확인하고 다시 눌러 주세요.");
    } finally { setBusy(false); }
  };

  return createPortal(
    <div className="modal-safe-area fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="watch-setup-title"
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 id="watch-setup-title" ref={titleRef} tabIndex={-1} className="text-lg font-bold">⌚ 워치 연결</h2>
          <button type="button" className={buttonStyle} onClick={onClose} disabled={busy}>닫기</button>
        </div>
        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 text-sm leading-relaxed" style={{ WebkitOverflowScrolling: "touch" }}>
          <p>워치에서 한 번 눌러 오늘 파종 내역과 내일 트레이 합계를 확인합니다. 내역이 많으면 같은 결과창에서 아래로 스크롤하세요.</p>
          {loading ? <p role="status">연결 상태 확인 중…</p> : (
            <section className="space-y-3 rounded-xl border border-slate-700 p-3">
              <p className="font-semibold">{status?.active ? "조회키 사용 중" : "워치 조회키 발급"}</p>
              {status?.expires_at && <p className="text-slate-400">만료: {new Date(status.expires_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</p>}
              {status?.active && <p className="text-amber-200">새로 발급하면 기존 조회키는 즉시 해제됩니다. 기존 단축어의 헤더 값도 바꿔 주세요.</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`${buttonStyle} !bg-emerald-700`} disabled={busy || !status} onClick={() => void issueToken()}>{busy ? "처리 중…" : status?.active ? "조회키 새로 발급" : "조회키 발급"}</button>
                {status?.active && <button type="button" className={buttonStyle} disabled={busy} onClick={() => void revokeToken()}>연결 해제</button>}
                {!status && <button type="button" className={buttonStyle} onClick={() => void loadStatus()}>상태 다시 확인</button>}
              </div>
              <p className="text-xs text-slate-400">조회키는 오늘·내일 파종 조회 전용이며 1년간 유효합니다. 원문은 발급 직후만 표시됩니다. 단축어를 다른 사람에게 공유하면 조회키도 함께 전달됩니다.</p>
            </section>
          )}
          {error && <p role="alert" className="rounded-xl bg-red-950 p-3 text-red-200">{error}</p>}
          {message && <p role="status" className="text-emerald-300">{message}</p>}
          <section className="space-y-3">
            <h3 className="text-base font-semibold">1. 아이폰 단축어 만들기</h3>
            <p>단축어 앱 → + → 이름을 <strong>파종 확인</strong>으로 지정하세요.</p>
            <label className="block" htmlFor="watch-url">요약 주소</label>
            <input id="watch-url" readOnly value={endpoint} className="w-full min-w-0 rounded-lg bg-slate-900 p-3 text-base" />
            <button type="button" className={buttonStyle} onClick={() => void copy(endpoint)}>주소 복사</button>
            <p><strong>‘URL 콘텐츠 가져오기’</strong> 동작을 추가하고 위 주소를 넣으세요. 펼치기(화살표) → 방법 <strong>GET</strong> → 헤더를 아래처럼 추가합니다.</p>
            <p>헤더 이름: <strong>Authorization</strong></p>
            {token ? <>
              <label className="block" htmlFor="watch-key">헤더 값 (Bearer와 공백 포함)</label>
              <input id="watch-key" readOnly type={showKey ? "text" : "password"} value={authHeader} autoComplete="off" className="w-full min-w-0 rounded-lg bg-slate-900 p-3 text-base" />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonStyle} onClick={() => void copy(authHeader)}>헤더 값 복사</button>
                <button type="button" className={buttonStyle} onClick={() => setShowKey(!showKey)}>{showKey ? "조회키 숨기기" : "조회키 보기"}</button>
              </div>
            </> : <p className="text-slate-400">조회키를 발급하면 복사할 헤더 값이 여기에 표시됩니다.</p>}
            <p>그 아래 <strong>‘알림 보기’</strong> 동작을 추가하세요. 제목은 ‘파종 확인’, 메시지는 앞 동작의 <strong>‘URL 콘텐츠’ 변수</strong>로 지정합니다. ‘취소 버튼 보기’는 끄세요.</p>
            <p>아이폰에서 한 번 실행하고 사이트 접근을 허용하세요. 통신 오류가 나오면 ‘파종 없음’으로 해석하지 마세요.</p>
          </section>
          <section className="space-y-2">
            <h3 className="text-base font-semibold">2. 워치에 버튼 배치</h3>
            <p>단축어 세부사항 → <strong>Apple Watch에서 보기</strong>를 켜세요.</p>
            <p>워치 페이스 길게 누르기 → 편집 → 컴플리케이션 → 단축어 → <strong>파종 확인</strong>을 선택하세요. 지원하는 페이스에서 버튼을 누르면 최신 요약이 열립니다.</p>
            <p className="text-slate-400">최초 워치 실행 시 접근 허용이 필요할 수 있습니다. 최신 조회에는 아이폰 연결, Wi-Fi 또는 셀룰러 통신이 필요합니다.</p>
            <a className="inline-block py-2 text-sky-300 underline" href="https://support.apple.com/ko-kr/guide/shortcuts/apd5888b0858/ios" target="_blank" rel="noreferrer">Apple 워치 단축어 설정 안내</a>
          </section>
          {token && <section className="space-y-3">
            <button type="button" className={`${buttonStyle} w-full !bg-emerald-700`} disabled={busy} onClick={() => void testSummary()}>현재 파종 요약 확인</button>
            {preview && <pre className="whitespace-pre-wrap break-words rounded-2xl border border-slate-700 bg-black p-4 font-sans text-base leading-relaxed">{preview}</pre>}
          </section>}
          <details className="rounded-xl border border-slate-800 p-3 text-slate-400">
            <summary className="cursor-pointer py-1">최초 설정 안내 (관리자 1회)</summary>
            <p className="mt-3">최초 사용 전 Supabase SQL Editor에서 저장소의 supabase-watch-sowing.sql을 전체 실행해야 합니다. 기존 주문 데이터는 변경하지 않습니다. 실행 후 이 창의 상태를 다시 확인하세요.</p>
            <a className="inline-block py-2 text-sky-300 underline" href="https://github.com/jami6613-del/chungju-nursery-app/blob/main/supabase-watch-sowing.sql" target="_blank" rel="noreferrer">설정 SQL 열기</a>
            <p>현재 배포의 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 서버 함수에서도 사용합니다. 추가 서버 비밀키나 서비스 역할 키는 필요하지 않습니다.</p>
          </details>
        </div>
      </div>
    </div>, document.body,
  );
}
