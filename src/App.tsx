import React from "react";
import { createPortal } from "react-dom";
import { Routes, Route, Navigate, useNavigate, Link, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import type { Order, SowingPlanItem, UnprocessedOrder, SeedOwner } from "./types";
import { getOrderStage, getOrderIndoorStartDate } from "./types";
import {
  fetchPlanCountsByDate,
  fetchSowingPlanItems,
  fetchUnprocessedOrders,
  fetchUnprocessedPendingCount,
  deleteOldSoftDeletedUnprocessedOrders,
  addSowingPlanItem,
  addUnprocessedOrder,
  reflectUnprocessedToPlan,
  unreflectUnprocessedOrder,
  updateSowingPlanItem,
  deleteSowingPlanItem,
  deleteOldSowingPlanItems,
  updateUnprocessedOrder,
  deleteUnprocessedOrder,
} from "./lib/planningApi";
import { DateWheel } from "./components/DateWheel";
import { Modal } from "./components/Modal";
import { TextField, SelectField, PrimaryButton, SecondaryButton } from "./components/ui";
import { fetchDailyTodos, saveDailyTodos } from "./lib/dailyTodosApi";
import { ROLE_LABEL, ROLE_LEVELS, canRequestEdits, canWriteOrders, canReflectToPlan, canAddPlanItem, canEditDailyTodos } from "./lib/permissions";
import { fetchPendingApprovalUsers, approveUser, fetchApprovedUsers } from "./lib/approvalApi";
import { savePushSubscription } from "./lib/pushApi";
import { updateMyName } from "./lib/userApi";
import { useTouchScroll } from "./hooks/useTouchScroll";

const TRAY_OPTIONS = ["200", "406", "72", "128", "포트", "105", "164", "직접입력"];

const PUSH_CONSENT_STORAGE_KEY = "push_consent_lv1";
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "";

/** 홈화면에 추가한 앱 아이콘에 배지 숫자 표시 (Web Badging API, iOS 16.4+ / Android Chrome PWA) */
function setAppIconBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count <= 0) {
      nav.clearAppBadge?.();
    } else {
      nav.setAppBadge?.(count > 99 ? 99 : count);
    }
  } catch {
    // ignore
  }
}

/** Lv1 사용자 전용: 푸시 알림 허용 후에만 메인메뉴 진입 가능 */
function PushPermissionGate({
  userId,
  onSuccess,
}: {
  userId: string;
  onSuccess: () => void;
}) {
  const [status, setStatus] = React.useState<"idle" | "asking" | "denied" | "error">("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const requestAndSubscribe = React.useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setErrorMessage("이 기기는 푸시 알림을 지원하지 않습니다. 메인메뉴로 이동합니다.");
      setStatus("error");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      // VAPID 미설정 시 동의 플래그만 세우고 진입 허용
      try {
        localStorage.setItem(`${PUSH_CONSENT_STORAGE_KEY}_${userId}`, "1");
        onSuccess();
      } catch {
        onSuccess();
      }
      return;
    }
    setStatus("asking");
    setErrorMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const subscription = sub || (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
      await savePushSubscription(userId, subscription);
      localStorage.setItem(`${PUSH_CONSENT_STORAGE_KEY}_${userId}`, "1");
      onSuccess();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "알림 등록에 실패했습니다.");
      setStatus("error");
    }
  }, [userId, onSuccess]);

  if (status === "denied") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
        <div className="mb-2 text-2xl font-bold">알림 허용이 필요합니다</div>
        <p className="mb-6 text-sm text-slate-300">
          주문 및 파종계획에 새 게시글이 등록되면 바로 알려드리려면 알림을 허용해 주세요. Lv1 사용자는 알림을 허용해야 메인메뉴로 이동할 수 있습니다.
        </p>
        <PrimaryButton onClick={() => setStatus("idle")}>다시 요청</PrimaryButton>
      </div>
    );
  }

  if (status === "error" && errorMessage) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
        <div className="mb-2 text-2xl font-bold">알림 설정 실패</div>
        <p className="mb-6 text-sm text-slate-300">{errorMessage}</p>
        <PrimaryButton onClick={() => { setStatus("idle"); setErrorMessage(null); }}>다시 시도</PrimaryButton>
        <button
          type="button"
          className="mt-3 text-sm text-slate-400 underline"
          onClick={() => { localStorage.setItem(`${PUSH_CONSENT_STORAGE_KEY}_${userId}`, "1"); onSuccess(); }}
        >
          알림 없이 메인메뉴로
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
      <div className="mb-2 text-2xl font-bold">푸시 알림 허용</div>
      <p className="mb-6 text-sm text-slate-300">
        주문 및 파종계획에 새로 등록된 게시글이 있을 때 푸시 알림을 받으려면 알림을 허용해 주세요. Lv1 사용자는 앱 사용을 위해 알림 허용이 필요합니다.
      </p>
      <PrimaryButton onClick={requestAndSubscribe} disabled={status === "asking"}>
        {status === "asking" ? "요청 중…" : "알림 허용하고 메인메뉴로"}
      </PrimaryButton>
    </div>
  );
}

/** VAPID 공개키(URL-safe base64)를 Uint8Array로 변환 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** 로컬 날짜 기준 YYYY-MM-DD (UTC가 아닌 사용자 시간대) */
function getLocalDateString(d?: Date): string {
  const t = d ?? new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const day = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateTimeKO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const w = WEEKDAY_KO[d.getDay()];
  const ampm = d.getHours() < 12 ? "오전" : "오후";
  const h = String(d.getHours() % 12 || 12).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}년 ${m}월 ${day}일 ${w}요일, ${ampm} ${h}:${min}`;
}

/** Lv0 최고관리자: 닉네임 없을 때 자동으로 '정효조' 설정 */
function Lv0NicknameAutoSet({ onRefresh }: { onRefresh: () => Promise<void> }) {
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await updateMyName("정효조");
        if (!cancelled) await onRefresh();
      } catch {
        if (!cancelled) await onRefresh();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onRefresh]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100">
      <div className="mb-2 text-lg font-semibold">충주 친환경 육묘장</div>
      <div className="text-sm text-slate-400">닉네임 설정 중...</div>
    </div>
  );
}

/** 가입 승인 후 첫 로그인 시 닉네임 설정 (3~8글자 한글) */
function NicknameGate({
  onSuccess,
  onSave,
  onRefresh,
}: {
  onSuccess: () => void;
  onSave: (nickname: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [nickname, setNickname] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const t = nickname.trim();
    if (!/^[가-힣]{3,8}$/.test(t)) {
      setError("닉네임은 3~8글자 한글로 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await onSave(t);
      await onRefresh();
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="mb-2 text-2xl font-bold">닉네임 설정</div>
      <p className="mb-6 text-sm text-slate-300">
        메인화면에 표시할 닉네임을 3~8글자 한글로 입력해 주세요.
      </p>
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
        <TextField
          label="닉네임"
          value={nickname}
          onChange={setNickname}
          type="text"
          placeholder="예: 홍길동"
        />
        {error && <div className="text-xs text-red-400">{error}</div>}
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "저장 중..." : "확인"}
        </PrimaryButton>
      </form>
    </div>
  );
}

function SupabaseSetupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
      <div className="mb-2 text-2xl font-extrabold">충주 친환경 육묘장</div>
      <div className="mb-6 text-sm text-slate-300">
        Supabase 환경변수가 설정되지 않아 앱을 시작할 수 없습니다.
      </div>
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-5 text-left text-sm">
        <div className="mb-2 font-semibold">설정 방법</div>
        <ol className="list-decimal space-y-1 pl-5 text-slate-200">
          <li>
            <code className="rounded bg-slate-800 px-1">.env.example</code>을 복사해{" "}
            <code className="rounded bg-slate-800 px-1">.env</code> 생성
          </li>
          <li>
            <code className="rounded bg-slate-800 px-1">VITE_SUPABASE_URL</code>,{" "}
            <code className="rounded bg-slate-800 px-1">VITE_SUPABASE_ANON_KEY</code> 입력
          </li>
          <li>개발 서버 재시작</li>
        </ol>
      </div>
    </div>
  );
}

const LAST_LOGIN_EMAIL_KEY = "last_login_email";

function LoginPage() {
  const { user, isLoading, refresh, signOut, touchActivity } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState(() => {
    try {
      return localStorage.getItem(LAST_LOGIN_EMAIL_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = React.useState("");
  const [mode, setMode] = React.useState<"login" | "register">("login");
  const [pendingMessage, setPendingMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user?.is_approved) return;
    if (user.role_level === 1 && !localStorage.getItem(`${PUSH_CONSENT_STORAGE_KEY}_${user.id}`)) return;
    if (!user.name?.trim()) return;
    navigate("/menu", { replace: true });
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!isSupabaseConfigured) {
        setError("Supabase 설정이 필요합니다. (.env 확인)");
        return;
      }
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError || !data.user) {
        setError("로그인에 실패했습니다. 아이디/비밀번호를 확인해주세요.");
        return;
      }
      try {
        localStorage.setItem(LAST_LOGIN_EMAIL_KEY, email.trim());
      } catch {
        // ignore
      }
      touchActivity();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const idTrimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(idTrimmed)) {
      setError("이메일 형식으로 입력해 주세요. (예: name@example.com)");
      return;
    }
    if (password.length < 4 || password.length > 16) {
      setError("비밀번호는 4~16자로 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      if (!isSupabaseConfigured) {
        setError("Supabase 설정이 필요합니다. (.env 확인)");
        return;
      }
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: idTrimmed,
        password,
      });
      if (signUpError || !data.user) {
        setError("가입 신청에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      setPendingMessage("가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-slate-100">
        <div className="mb-4 text-lg font-semibold">충주 친환경 육묘장</div>
        <div className="text-sm text-slate-400">로딩 중...</div>
      </div>
    );
  }

  if (pendingMessage && !user?.is_approved) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
        <div className="mb-2 text-2xl font-bold">가입 신청 완료</div>
        <p className="mb-6 text-sm text-slate-300">{pendingMessage}</p>
        <PrimaryButton
          onClick={() => {
            void signOut();
            setMode("login");
            setPendingMessage(null);
          }}
        >
          로그인 화면으로
        </PrimaryButton>
      </div>
    );
  }

  if (user && !user.is_approved) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
        <div className="mb-2 text-2xl font-bold">승인 대기 중</div>
        <p className="mb-6 text-sm text-slate-300">
          관리자 승인 후 로그인할 수 있습니다. 최고관리자에게 문의하세요.
        </p>
        <PrimaryButton onClick={() => void signOut()}>
          로그아웃
        </PrimaryButton>
      </div>
    );
  }

  if (user && user.is_approved && user.role_level === 1 && !localStorage.getItem(`${PUSH_CONSENT_STORAGE_KEY}_${user.id}`)) {
    return (
      <PushPermissionGate
        userId={user.id}
        onSuccess={async () => {
          await refresh();
        }}
      />
    );
  }

  if (user && user.is_approved && (user.role_level !== 1 || localStorage.getItem(`${PUSH_CONSENT_STORAGE_KEY}_${user.id}`)) && !user.name?.trim()) {
    if (user.role_level === 0) {
      return <Lv0NicknameAutoSet onRefresh={refresh} />;
    }
    return (
      <NicknameGate
        onSuccess={() => navigate("/menu", { replace: true })}
        onSave={updateMyName}
        onRefresh={refresh}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-10">
        <div className="text-2xl font-extrabold tracking-tight sm:text-3xl">충주 친환경 육묘장</div>
        <div className="mt-1 text-sm text-slate-400">사내 전용 파종·출하 관리</div>
      </div>

      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl shadow-black/50 sm:p-6">
        <div className="mb-4 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-xl px-3 py-2 font-semibold ${
              mode === "login"
                ? "bg-brand text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 rounded-xl px-3 py-2 font-semibold ${
              mode === "register"
                ? "bg-brand text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            직원인증 및 등록
          </button>
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={mode === "login" ? handleLogin : handleRegister}
        >
          <TextField
            label="이메일"
            value={email}
            onChange={setEmail}
            type="email"
            placeholder={mode === "login" ? "이메일 주소" : "예: name@example.com"}
            inputClassName={mode === "login" ? "placeholder-opacity-50" : undefined}
            autoComplete={mode === "login" ? "username" : "off"}
          />
          <TextField
            label="비밀번호"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder={mode === "register" ? "4~16자" : ""}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {error && <div className="text-xs text-red-400">{error}</div>}

          <PrimaryButton type="submit" disabled={busy}>
            {mode === "login" ? "로그인" : "가입 신청"}
          </PrimaryButton>

          {mode === "register" && (
            <p className="mt-1 text-xs text-slate-400">
              이메일 형식으로 가입해 주세요. 가입 신청 후 관리자 승인 시 로그인할 수 있습니다.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

function useOrders() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!isSupabaseConfigured) {
      setOrders([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .order("sowing_date", { ascending: false });
      setOrders((data as Order[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { orders, loading, reload: load, setOrders };
}

type OrderFormState = {
  id?: string;
  customer_name: string;
  crop_name: string;
  seed_owner: SeedOwner;
  sowing_date: string;
  shipping_date: string;
  tray_type: string;
  tray_custom: string;
  quantity_base: string;
  quantity_extra: string;
  shipping_quantity: string;
  note: string;
};

const emptyForm: OrderFormState = {
  customer_name: "",
  crop_name: "",
  seed_owner: "육묘장",
  sowing_date: "",
  shipping_date: "",
  tray_type: "",
  tray_custom: "",
  quantity_base: "",
  quantity_extra: "",
  shipping_quantity: "",
  note: "",
};

function DashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { orders, loading, reload, setOrders } = useOrders();
  const [now, setNow] = React.useState(new Date());
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchConditions, setSearchConditions] = React.useState({
    sowing_date: "",
    customer_name: "",
    crop_name: "",
    seed_owner: "",
    quantity: "",
    tray_type: "",
    shipping_date: "",
    shipping_quantity: "",
    note: "",
  });
  const emptySearchConditions = {
    sowing_date: "",
    customer_name: "",
    crop_name: "",
    seed_owner: "",
    quantity: "",
    tray_type: "",
    shipping_date: "",
    shipping_quantity: "",
    note: "",
  };

  const [formOpen, setFormOpen] = React.useState(false);
  const [formState, setFormState] = React.useState<OrderFormState>(emptyForm);
  const [formBusy, setFormBusy] = React.useState(false);
  const [popupOrder, setPopupOrder] = React.useState<Order | null>(null);
  const [shippingOnlyOrder, setShippingOnlyOrder] = React.useState<Order | null>(null);
  const [shippingOnlyDate, setShippingOnlyDate] = React.useState("");
  const [shippingOnlyQty, setShippingOnlyQty] = React.useState("");
  const [shippingOnlyBusy, setShippingOnlyBusy] = React.useState(false);
  const [noShippingToast, setNoShippingToast] = React.useState<{
    x: number;
    y: number;
    visible: boolean;
  } | null>(null);
  const [outdoorConfirmOrder, setOutdoorConfirmOrder] = React.useState<Order | null>(null);
  const [outdoorConfirmBusy, setOutdoorConfirmBusy] = React.useState(false);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = React.useState<Order | null>(null);
  const [deleteOrderBusy, setDeleteOrderBusy] = React.useState(false);
  const [deleteOrderError, setDeleteOrderError] = React.useState<string | null>(null);
  const [roleInfoOpen, setRoleInfoOpen] = React.useState(false);
  const [yearSelectOpen, setYearSelectOpen] = React.useState(false);
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = React.useState(currentYear);

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    if (!noShippingToast || noShippingToast.visible) return;
    const t = setTimeout(() => setNoShippingToast(null), 350);
    return () => clearTimeout(t);
  }, [noShippingToast?.visible]);

  const handleNew = () => {
    setFormState({
      ...emptyForm,
      sowing_date: getLocalDateString(),
    });
    setFormOpen(true);
  };

  const autocompleteCustomers = Array.from(new Set(orders.map((o) => o.customer_name)));
  const autocompleteCrops = Array.from(new Set(orders.map((o) => o.crop_name)));

  const hasAnySearchCondition = Object.values(searchConditions).some(
    (v) => typeof v === "string" && v.trim() !== "",
  );

  const filteredOrders = orders.filter((o) => {
    const s = searchConditions;
    if (s.sowing_date.trim() && !o.sowing_date.includes(s.sowing_date.trim())) return false;
    if (s.customer_name.trim() && !o.customer_name.includes(s.customer_name.trim())) return false;
    if (s.crop_name.trim() && !o.crop_name.includes(s.crop_name.trim())) return false;
    if (s.seed_owner.trim() && o.seed_owner !== s.seed_owner.trim()) return false;
    if (s.quantity.trim()) {
      const display = `${o.quantity_base}+${o.quantity_extra}`;
      if (!display.includes(s.quantity.trim())) return false;
    }
    if (s.tray_type.trim() && !o.tray_type.includes(s.tray_type.trim())) return false;
    if (s.shipping_date.trim()) {
      const sd = o.shipping_date ?? "";
      if (!sd.includes(s.shipping_date.trim())) return false;
    }
    if (s.shipping_quantity.trim()) {
      const sq = o.shipping_quantity != null ? String(o.shipping_quantity) : "";
      if (!sq.includes(s.shipping_quantity.trim())) return false;
    }
    if (s.note.trim()) {
      const n = o.note ?? "";
      if (!n.includes(s.note.trim())) return false;
    }
    return true;
  });

  // 연도별: 파종일자 YYYY 기준. 데이터 있는 연도만 목록에 포함, 없으면 현재 연도
  const availableYears = React.useMemo(() => {
    const years = new Set<number>();
    filteredOrders.forEach((o) => {
      const y = o.sowing_date ? parseInt(o.sowing_date.slice(0, 4), 10) : NaN;
      if (!isNaN(y)) years.add(y);
    });
    if (years.size === 0) years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [filteredOrders, currentYear]);

  React.useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears.includes(currentYear) ? currentYear : availableYears[0] ?? currentYear);
    }
  }, [availableYears, selectedYear, currentYear]);

  // 선택한 연도 기준으로 필터 + 파종일자 순 내림차순
  const displayOrders = React.useMemo(
    () =>
      [...filteredOrders]
        .filter((o) => (o.sowing_date || "").startsWith(String(selectedYear)))
        .sort((a, b) =>
          (b.sowing_date || "").localeCompare(a.sowing_date || ""),
        ),
    [filteredOrders, selectedYear],
  );

  const stageCounts = React.useMemo(() => {
    const todayStr = getLocalDateString();
    let germination = 0;
    let indoor = 0;
    let outdoor = 0;
    displayOrders.forEach((o) => {
      const stage = getOrderStage(o, todayStr);
      const qty = Number(o.quantity_base) + Number(o.quantity_extra);
      if (stage === "germination") germination += qty;
      else if (stage === "indoor") indoor += qty;
      else if (stage === "outdoor") outdoor += qty;
      // shipped 제외
    });
    return { germination, indoor, outdoor };
  }, [displayOrders]);

  const handleFormChange = (patch: Partial<OrderFormState>) => {
    setFormState((prev) => ({ ...prev, ...patch }));
  };

  const trayValue =
    formState.tray_type === "직접입력" ? formState.tray_custom : formState.tray_type || "";

  const handleSaveOrder = async () => {
    if (!user) return;
    setFormBusy(true);
    try {
      const payload = {
        customer_name: formState.customer_name,
        crop_name: formState.crop_name,
        seed_owner: formState.seed_owner,
        sowing_date: formState.sowing_date,
        shipping_date: formState.shipping_date || null,
        tray_type: trayValue,
        quantity_base: Number(formState.quantity_base || "0"),
        quantity_extra: Number(formState.quantity_extra || "0"),
        shipping_quantity: formState.shipping_quantity
          ? Number(formState.shipping_quantity)
          : null,
        note: formState.note || null,
        created_by: user.id,
      };

      if (formState.id) {
        const { data } = await supabase
          .from("orders")
          .update(payload)
          .eq("id", formState.id)
          .select()
          .single();
        if (data) {
          setOrders((prev) => prev.map((o) => (o.id === data.id ? (data as Order) : o)));
        }
      } else {
        const { data } = await supabase.from("orders").insert(payload).select().single();
        if (data)
          setOrders((prev) =>
            [...prev, data as Order].sort((a, b) =>
              (b.sowing_date || "").localeCompare(a.sowing_date || ""),
            ),
          );
      }
      setFormOpen(false);
      setFormState(emptyForm);
    } finally {
      setFormBusy(false);
    }
  };

  const openEditPopup = (order: Order) => {
    setPopupOrder(order);
  };

  const handleMarkShippingSame = () => {
    if (!popupOrder) return;
    const total = popupOrder.quantity_base + popupOrder.quantity_extra;
    setFormState((prev) => ({ ...prev, shipping_quantity: String(total) }));
  };

  const startEditFromPopup = () => {
    if (!popupOrder) return;
    setFormState({
      id: popupOrder.id,
      customer_name: popupOrder.customer_name,
      crop_name: popupOrder.crop_name,
      seed_owner: popupOrder.seed_owner,
      sowing_date: popupOrder.sowing_date,
      shipping_date: popupOrder.shipping_date ?? "",
      tray_type: TRAY_OPTIONS.includes(popupOrder.tray_type) ? popupOrder.tray_type : "직접입력",
      tray_custom: TRAY_OPTIONS.includes(popupOrder.tray_type) ? "" : popupOrder.tray_type,
      quantity_base: String(popupOrder.quantity_base),
      quantity_extra: String(popupOrder.quantity_extra),
      shipping_quantity: popupOrder.shipping_quantity
        ? String(popupOrder.shipping_quantity)
        : "",
      note: popupOrder.note ?? "",
    });
    setPopupOrder(null);
    setFormOpen(true);
  };

  const openShippingOnly = (order: Order) => {
    setShippingOnlyOrder(order);
    setShippingOnlyDate(getLocalDateString());
    setShippingOnlyQty(String(order.quantity_base + order.quantity_extra));
    setPopupOrder(null);
  };

  const handleSaveShippingOnly = async () => {
    if (!shippingOnlyOrder || !user) return;
    setShippingOnlyBusy(true);
    try {
      const { data } = await supabase
        .from("orders")
        .update({
          shipping_date: shippingOnlyDate || null,
          shipping_quantity: shippingOnlyQty ? Number(shippingOnlyQty) : null,
        })
        .eq("id", shippingOnlyOrder.id)
        .select()
        .single();
      if (data) {
        setOrders((prev) => prev.map((o) => (o.id === data.id ? (data as Order) : o)));
      }
      setShippingOnlyOrder(null);
    } finally {
      setShippingOnlyBusy(false);
    }
  };

  const handleConfirmOutdoorHardening = async () => {
    if (!outdoorConfirmOrder || !user) return;
    setOutdoorConfirmBusy(true);
    const orderId = outdoorConfirmOrder.id;
    try {
      await supabase
        .from("orders")
        .update({ outdoor_hardening: true })
        .eq("id", orderId);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, outdoor_hardening: true } : o,
        ),
      );
      setOutdoorConfirmOrder(null);
      setPopupOrder(null);
    } finally {
      setOutdoorConfirmBusy(false);
    }
  };

  const handleDeleteOrderConfirm = async () => {
    if (!deleteConfirmOrder) return;
    setDeleteOrderError(null);
    setDeleteOrderBusy(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .delete()
        .eq("id", deleteConfirmOrder.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("삭제할 수 없습니다. 권한(RLS) 설정을 확인해 주세요.");
      }
      setOrders((prev) => prev.filter((o) => o.id !== deleteConfirmOrder.id));
      setDeleteConfirmOrder(null);
      setPopupOrder(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "삭제에 실패했습니다.";
      setDeleteOrderError(msg);
    } finally {
      setDeleteOrderBusy(false);
    }
  };

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const readOnly = !canWriteOrders(user);

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const rowBgByStage: Record<string, string> = {
    germination: "bg-yellow-200/90 text-slate-900",   // 발아실: 연노랑
    indoor: "bg-green-600/80 text-slate-100",         // 실내 육묘: 녹색
    outdoor: "bg-orange-400/90 text-slate-900",       // 야외 경화: 주황색
    shipped: "bg-slate-800 text-slate-100",           // 출하 완료: 어두운 네이비(범례와 동일)
  };

  const listScrollRef = React.useRef<HTMLDivElement>(null);
  useTouchScroll(listScrollRef);

  return (
    <div className="order-list-page flex h-[100dvh] flex-col overflow-hidden bg-slate-950 text-slate-50">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-0">
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold tracking-tight sm:text-2xl md:text-3xl">충주 친환경 육묘장</div>
            <div className="text-xs text-slate-400 sm:text-base">파종 및 출하현황</div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2.5 text-right text-[0.825rem] sm:gap-3 sm:text-[1.1rem]">
            <button
              type="button"
              onClick={() => setRoleInfoOpen(true)}
              className="rounded-full bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              {ROLE_LABEL[user.role_level]}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              로그아웃
            </button>
            <span className="hidden text-slate-400 sm:inline">{formatDateTimeKO(now)}</span>
            <button
              type="button"
              onClick={() => navigate("/menu")}
              className="rounded-lg bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              메인메뉴
            </button>
          </div>
        </div>
      </header>

      <Modal
        open={roleInfoOpen}
        title="권한 등급 안내"
        onClose={() => setRoleInfoOpen(false)}
      >
        <div className="space-y-2 text-sm text-slate-200">
          {ROLE_LEVELS.map((level) => (
            <div key={level}>
              {ROLE_LABEL[level]}
              {level === user.role_level && (
                <span className="ml-1 text-amber-400">* 현재 나의 등급입니다.</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-slate-700 pt-3 text-xs text-slate-400">
          권한에 관한 문의는 최고관리자에게 문의바랍니다 (정효조 / 010-2604-6588)
        </p>
      </Modal>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-24 pt-3">
        {user.is_approved ? null : (
          <div className="mb-3 shrink-0 rounded-xl border border-yellow-600 bg-yellow-950/40 px-4 py-3 text-base text-yellow-200">
            관리자 승인 대기 중입니다. 읽기 전용으로만 이용 가능합니다.
          </div>
        )}

        <div className="mb-2 flex shrink-0 items-center justify-end gap-2 sm:mb-3">
          <button
            type="button"
            onClick={() => setYearSelectOpen(true)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 sm:rounded-xl sm:px-5 sm:py-3 sm:text-base"
          >
            연도선택
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 sm:rounded-xl sm:px-5 sm:py-3 sm:text-base"
          >
            검색
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 sm:rounded-xl sm:px-4 sm:py-3 sm:text-base"
          >
            새로고침
          </button>
        </div>

        {createPortal(
        <Modal
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          title="검색 조건"
          titleSize="lg"
        >
          <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto sm:gap-3 sm:text-base">
            <TextField
              label="파종일자"
              value={searchConditions.sowing_date}
              onChange={(v) =>
                setSearchConditions((prev) => ({ ...prev, sowing_date: v }))
              }
              size="lg"
            />
            <TextField
              label="주문자"
              value={searchConditions.customer_name}
              onChange={(v) =>
                setSearchConditions((prev) => ({ ...prev, customer_name: v }))
              }
              size="lg"
            />
            <TextField
              label="파종작물"
              value={searchConditions.crop_name}
              onChange={(v) =>
                setSearchConditions((prev) => ({ ...prev, crop_name: v }))
              }
              size="lg"
            />
            <SelectField
              label="종자 소유자"
              value={searchConditions.seed_owner}
              onChange={(v) =>
                setSearchConditions((prev) => ({ ...prev, seed_owner: v }))
              }
              options={[
                { value: "", label: "전체" },
                { value: "육묘장", label: "육묘장" },
                { value: "주문자", label: "주문자" },
              ]}
              size="lg"
            />
            <TextField
              label="파종수량 (예: 300+14)"
              value={searchConditions.quantity}
              onChange={(v) =>
                setSearchConditions((prev) => ({ ...prev, quantity: v }))
              }
              size="lg"
            />
            <TextField
              label="트레이(구)"
              value={searchConditions.tray_type}
              onChange={(v) =>
                setSearchConditions((prev) => ({ ...prev, tray_type: v }))
              }
              size="lg"
            />
            <TextField
              label="출하일자"
              value={searchConditions.shipping_date}
              onChange={(v) =>
                setSearchConditions((prev) => ({ ...prev, shipping_date: v }))
              }
              size="lg"
            />
            <TextField
              label="출하수량"
              value={searchConditions.shipping_quantity}
              onChange={(v) =>
                setSearchConditions((prev) => ({
                  ...prev,
                  shipping_quantity: v,
                }))
              }
              size="lg"
            />
            <TextField
              label="비고"
              value={searchConditions.note}
              onChange={(v) =>
                setSearchConditions((prev) => ({ ...prev, note: v }))
              }
              size="lg"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <SecondaryButton
                onClick={() => {
                  setSearchConditions(emptySearchConditions);
                }}
                size="lg"
              >
                초기화
              </SecondaryButton>
              <PrimaryButton
                onClick={() => setSearchOpen(false)}
                disabled={!hasAnySearchCondition}
                size="lg"
              >
                검색
              </PrimaryButton>
            </div>
            {!hasAnySearchCondition && (
              <p className="text-sm text-slate-400">
                하나 이상의 조건을 입력한 뒤 검색하세요.
              </p>
            )}
          </div>
        </Modal>,
        document.body,
        )}

        {createPortal(
        <Modal
          open={yearSelectOpen}
          onClose={() => setYearSelectOpen(false)}
          title="연도선택"
          titleSize="lg"
        >
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {availableYears.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => {
                  setSelectedYear(y);
                  setYearSelectOpen(false);
                }}
                className={`rounded-xl px-4 py-3 text-base font-semibold sm:px-5 sm:py-3 sm:text-lg ${
                  selectedYear === y
                    ? "border-2 border-brand bg-brand/20 text-brand"
                    : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                }`}
              >
                {y}년
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-400">
            파종일자 기준 해당 연도 데이터만 표시됩니다.
          </p>
        </Modal>,
        document.body,
        )}

        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-slate-400 sm:gap-3 sm:text-sm">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 rounded border border-slate-600 bg-yellow-200/90 sm:h-4 sm:w-6" />
              연노랑: 발아실
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 rounded border border-slate-600 bg-green-600/80 sm:h-4 sm:w-6" />
              녹색: 실내 육묘
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 rounded border border-slate-600 bg-orange-400/90 sm:h-4 sm:w-6" />
              주황: 야외 경화
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 rounded border border-slate-600 bg-slate-800 sm:h-4 sm:w-6" />
              남색: 출하완료
            </span>
          </div>
          {hasAnySearchCondition && (
            <button
              type="button"
              onClick={() => setSearchConditions(emptySearchConditions)}
              className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm"
            >
              전체리스트 보기
            </button>
          )}
        </div>

        <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-0.5 text-sm font-medium sm:gap-x-6 sm:text-base">
          <span>
            <span className="text-yellow-300">발아실</span>
            <span className="ml-1 text-slate-200">: {stageCounts.germination}판</span>
          </span>
          <span>
            <span className="text-green-400">실내</span>
            <span className="ml-1 text-slate-200">: {stageCounts.indoor}판</span>
          </span>
          <span>
            <span className="text-orange-400">야외</span>
            <span className="ml-1 text-slate-200">: {stageCounts.outdoor}판</span>
          </span>
        </div>

        <div
          ref={listScrollRef}
          className="order-list-scroll-area min-h-0 flex-1 overflow-auto rounded-xl border border-slate-800 bg-slate-900 pb-20 sm:rounded-2xl sm:pb-24"
        >
          <table className="order-list-table min-w-full text-[0.75rem] sm:text-base sm:table-auto">
            <colgroup>
              <col className="order-col-fit" />
              <col className="order-col-fit" />
              <col className="order-col-fit" />
              <col className="order-col-fit" />
              <col className="order-col-fit" />
              <col className="order-col-fit" />
              <col className="order-col-fit" />
              <col className="order-col-fit" />
              <col className="order-col-note" />
            </colgroup>
            <thead className="bg-slate-950/60 text-[0.7rem] uppercase tracking-tight text-slate-400 sm:text-sm sm:tracking-normal">
              <tr>
                <th className="whitespace-nowrap px-1.5 py-2 text-left sm:px-3 sm:py-3">파종일</th>
                <th className="whitespace-nowrap px-1.5 py-2 text-left sm:px-3 sm:py-3">주문자</th>
                <th className="whitespace-nowrap px-1.5 py-2 text-left sm:px-3 sm:py-3">파종작물</th>
                <th className="whitespace-nowrap px-1.5 py-2 text-left sm:px-3 sm:py-3">종자</th>
                <th className="whitespace-nowrap px-1.5 py-2 text-left sm:px-3 sm:py-3">수량</th>
                <th className="whitespace-nowrap px-1.5 py-2 text-left sm:px-3 sm:py-3">트레이</th>
                <th className="whitespace-nowrap px-1.5 py-2 text-left sm:px-3 sm:py-3">출하일</th>
                <th className="whitespace-nowrap px-1.5 py-2 text-left sm:px-3 sm:py-3">출하수량</th>
                <th className="whitespace-nowrap px-1.5 py-2 text-left sm:px-3 sm:py-3">비고</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-1.5 py-3 text-center text-slate-400 sm:px-3 sm:py-6">
                    불러오는 중...
                  </td>
                </tr>
              )}
              {!loading && displayOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-1.5 py-3 text-center text-slate-400 sm:px-3 sm:py-6">
                    데이터가 없습니다.
                  </td>
                </tr>
              )}
              {displayOrders.map((o, idx) => {
                const prev = displayOrders[idx - 1];
                const prevDate = prev?.sowing_date ?? "";
                const prevMonth = prevDate.length >= 7 ? prevDate.slice(0, 7) : "";
                const currDate = o.sowing_date ?? "";
                const currMonth = currDate.length >= 7 ? currDate.slice(0, 7) : "";
                const isMonthBreak = prev && currMonth !== prevMonth;
                const isDateBreak = prev && currDate !== prevDate;
                const stage = getOrderStage(o, todayStr);
                const sowingShort = o.sowing_date && o.sowing_date.length >= 10 ? o.sowing_date.slice(5, 10) : (o.sowing_date || "-");
                const shippingShort = o.shipping_date && o.shipping_date.length >= 10 ? o.shipping_date.slice(5, 10) : (o.shipping_date ? o.shipping_date : "-");
                return (
                  <React.Fragment key={o.id}>
                    {isMonthBreak && (
                      <tr aria-hidden="true" className="pointer-events-none">
                        <td colSpan={9} className="border-t border-slate-600/40 py-1.5 sm:py-2" />
                      </tr>
                    )}
                    {!isMonthBreak && isDateBreak && (
                      <tr aria-hidden="true" className="pointer-events-none">
                        <td colSpan={9} className="py-0.5 sm:py-1" />
                      </tr>
                    )}
                    <tr
                      className={`cursor-pointer border-t border-slate-800 hover:opacity-90 ${rowBgByStage[stage]}`}
                      onClick={() => openEditPopup(o)}
                    >
                      <td className="whitespace-nowrap px-1.5 py-1.5 sm:px-3 sm:py-2">{sowingShort}</td>
                      <td className="min-w-0 max-w-[3.5rem] truncate px-1.5 py-1.5 sm:max-w-none sm:px-3 sm:py-2">{o.customer_name}</td>
                      <td className="min-w-0 max-w-[3.5rem] truncate px-1.5 py-1.5 sm:max-w-none sm:px-3 sm:py-2">{o.crop_name}</td>
                      <td className="whitespace-nowrap px-1.5 py-1.5 sm:px-3 sm:py-2">{o.seed_owner}</td>
                      <td className="whitespace-nowrap px-1.5 py-1.5 sm:px-3 sm:py-2">
                        {o.quantity_base}+{o.quantity_extra}
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-1.5 sm:px-3 sm:py-2">{o.tray_type}</td>
                      <td className="whitespace-nowrap px-1.5 py-1.5 sm:px-3 sm:py-2">{shippingShort}</td>
                      <td className="whitespace-nowrap px-1.5 py-1.5 sm:px-3 sm:py-2">{o.shipping_quantity ?? "-"}</td>
                      <td className="min-w-0 whitespace-normal px-1.5 py-1.5 text-left sm:max-w-none sm:px-3 sm:py-2 sm:truncate sm:max-w-[4rem]">{o.note ?? ""}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {createPortal(
        <>
          {canRequestEdits(user) && user.role_level === 2 && (
            <div className="fixed bottom-4 left-1/2 z-[90] w-[90%] max-w-md -translate-x-1/2 rounded-lg border border-blue-800 bg-blue-950/80 px-3 py-2 text-xs text-blue-100 shadow-lg shadow-black/40 sm:rounded-xl sm:px-4 sm:py-3 sm:text-base">
              일반 실무자는 읽기 전용입니다. 수정이 필요하면 별도 게시판에 &quot;입력/수정 요청&quot; 글을
              남겨주세요.
            </div>
          )}
          {canWriteOrders(user) && (
            <div className="fixed bottom-5 right-4 z-[90] flex flex-col items-center sm:bottom-6 sm:right-6">
              <span className="mb-1 rounded-lg bg-slate-400/85 px-2 py-0.5 text-[10px] font-semibold text-slate-900 sm:mb-1.5 sm:px-2.5 sm:py-1 sm:text-xs">
                파종입력
              </span>
              <button
                type="button"
                onClick={handleNew}
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand text-2xl font-bold leading-none text-white shadow-xl shadow-black/40 sm:h-14 sm:w-14 sm:text-3xl"
              >
                <span className="inline-flex items-center justify-center leading-none">+</span>
              </button>
            </div>
          )}
        </>,
        document.body,
      )}

      {createPortal(
        <Modal
        open={formOpen}
        onClose={() => {
          if (!formBusy) {
            setFormOpen(false);
            setFormState(emptyForm);
          }
        }}
        title={formState.id ? "파종 정보 수정" : "파종입력"}
        titleSize="lg"
      >
        <div className="flex min-w-0 max-w-full flex-col gap-4 text-base">
          <div className="flex min-w-0 gap-2">
            <div className="relative min-w-0 flex-1 max-w-[50%]">
              <TextField
                label="주문자"
                value={formState.customer_name}
                onChange={(v) => handleFormChange({ customer_name: v })}
                size="lg"
              />
              {formState.customer_name && !autocompleteCustomers.includes(formState.customer_name) && (
                <div className="absolute left-0 right-0 top-full z-10 max-h-40 overflow-auto rounded-xl bg-slate-900 text-base shadow-lg">
                  {autocompleteCustomers
                    .filter((c) => c.includes(formState.customer_name))
                    .slice(0, 5)
                    .map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleFormChange({ customer_name: c })}
                        className="block w-full px-4 py-2 text-left hover:bg-slate-800"
                      >
                        {c}
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="relative min-w-0 flex-1 max-w-[50%]">
              <TextField
                label="파종작물"
                value={formState.crop_name}
                onChange={(v) => handleFormChange({ crop_name: v })}
                size="lg"
              />
              {formState.crop_name && !autocompleteCrops.includes(formState.crop_name) && (
                <div className="absolute left-0 right-0 top-full z-10 max-h-40 overflow-auto rounded-xl bg-slate-900 text-base shadow-lg">
                  {autocompleteCrops
                    .filter((c) => c.includes(formState.crop_name))
                    .slice(0, 5)
                    .map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleFormChange({ crop_name: c })}
                        className="block w-full px-4 py-2 text-left hover:bg-slate-800"
                      >
                        {c}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 gap-2">
            <DateWheel
              label="파종일자"
              value={formState.sowing_date}
              onChange={(v) => handleFormChange({ sowing_date: v })}
              size="lg"
            />
            {formState.id &&
              (() => {
                const hasShipping = !!(
                  formState.shipping_date ||
                  (formState.shipping_quantity && formState.shipping_quantity.trim() !== "")
                );
                if (hasShipping) {
                  return (
                    <DateWheel
                      label="출하일자"
                      value={formState.shipping_date}
                      onChange={(v) => handleFormChange({ shipping_date: v })}
                      size="lg"
                    />
                  );
                }
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      setNoShippingToast({
                        x: e.clientX,
                        y: e.clientY,
                        visible: true,
                      });
                      setTimeout(
                        () =>
                          setNoShippingToast((prev) =>
                            prev ? { ...prev, visible: false } : null,
                          ),
                        2000,
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        (e.target as HTMLElement).click();
                      }
                    }}
                    className="flex flex-col gap-1 cursor-not-allowed rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-base text-slate-500"
                  >
                    <span className="text-slate-400">출하일자</span>
                    <span className="text-slate-500">출하정보 없음</span>
                  </div>
                );
              })()}
          </div>

          <div className="flex gap-4 text-base">
            <div className="flex items-center gap-3">
              <span className="text-slate-200">종자 소유자</span>
              {(["육묘장", "주문자"] as SeedOwner[]).map((v) => (
                <label key={v} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={formState.seed_owner === v}
                    onChange={() => handleFormChange({ seed_owner: v })}
                    className="h-4 w-4 accent-brand"
                  />
                  <span className="text-slate-300">{v}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 items-end gap-4">
            <div className="min-w-0 max-w-[7rem] flex-1">
              <TextField
                label="파종수량"
                value={formState.quantity_base}
                onChange={(v) => handleFormChange({ quantity_base: v })}
                type="number"
                size="lg"
              />
            </div>
            <div className="min-w-0 max-w-[5.5rem] flex-shrink-0">
              <TextField
                label="추가 판"
                value={formState.quantity_extra}
                onChange={(v) => handleFormChange({ quantity_extra: v })}
                type="number"
                step="any"
                size="lg"
              />
            </div>
          </div>

          <div className="flex min-w-0 gap-2">
            <SelectField
              label="트레이(구)"
              value={formState.tray_type}
              onChange={(v) => handleFormChange({ tray_type: v })}
              options={[
                { value: "", label: "선택" },
                ...TRAY_OPTIONS.map((t) => ({ value: t, label: t })),
              ]}
              size="lg"
            />
            <TextField
              label="직접입력"
              value={formState.tray_custom}
              onChange={(v) => handleFormChange({ tray_custom: v })}
              disabled={formState.tray_type !== "직접입력"}
              size="lg"
            />
          </div>

          {formState.id &&
            (() => {
              const hasShipping = !!(
                formState.shipping_date ||
                (formState.shipping_quantity && formState.shipping_quantity.trim() !== "")
              );
              if (hasShipping) {
                return (
                  <div className="flex gap-2">
                    <TextField
                      label="출하수량"
                      value={formState.shipping_quantity}
                      onChange={(v) => handleFormChange({ shipping_quantity: v })}
                      type="number"
                      size="lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const total =
                          Number(formState.quantity_base || "0") +
                          Number(formState.quantity_extra || "0");
                        handleFormChange({ shipping_quantity: String(total) });
                      }}
                      className="mt-6 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-100 hover:bg-slate-800"
                    >
                      출하수량 = 파종수량과 동일
                    </button>
                  </div>
                );
              }
              return (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    setNoShippingToast({
                      x: e.clientX,
                      y: e.clientY,
                      visible: true,
                    });
                    setTimeout(
                      () =>
                        setNoShippingToast((prev) =>
                          prev ? { ...prev, visible: false } : null,
                        ),
                      2000,
                    );
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      (e.target as HTMLElement).click();
                    }
                  }}
                  className="flex flex-col gap-1 cursor-not-allowed rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-base text-slate-500"
                >
                  <span className="text-slate-400">출하수량</span>
                  <span className="text-slate-500">출하정보 없음</span>
                </div>
              );
            })()}

          <TextField
            label="비고"
            value={formState.note}
            onChange={(v) => handleFormChange({ note: v })}
            size="lg"
          />

          <div className="mt-4 flex justify-end gap-3">
            <SecondaryButton
              onClick={() => {
                if (!formBusy) {
                  setFormOpen(false);
                  setFormState(emptyForm);
                }
              }}
              size="lg"
            >
              취소
            </SecondaryButton>
            <PrimaryButton onClick={handleSaveOrder} disabled={formBusy} size="lg">
              저장
            </PrimaryButton>
          </div>
        </div>
      </Modal>,
        document.body,
      )}

      {createPortal(
        <>
      <Modal
        open={popupOrder !== null}
        onClose={() => setPopupOrder(null)}
        title="현황 편집"
        titleSize="lg"
      >
        {popupOrder && (
          <div className="flex flex-col gap-4 text-base">
            <div className="text-base text-slate-300">
              {popupOrder.customer_name} / {popupOrder.crop_name}
            </div>
            <div className="text-base text-slate-400">
              파종일자: {popupOrder.sowing_date} · 파종수량: {popupOrder.quantity_base}+
              {popupOrder.quantity_extra}
            </div>
            <div className="flex flex-wrap gap-3">
              <SecondaryButton onClick={startEditFromPopup} disabled={!canWriteOrders(user)} size="lg">
                수정
              </SecondaryButton>
              <PrimaryButton
                size="lg"
                onClick={() => openShippingOnly(popupOrder)}
                disabled={!canWriteOrders(user)}
              >
                출하
              </PrimaryButton>
              {!popupOrder.outdoor_hardening && (
                <button
                  type="button"
                  onClick={() => setOutdoorConfirmOrder(popupOrder)}
                  disabled={!canWriteOrders(user)}
                  className="rounded-xl border border-amber-500/70 bg-amber-100/80 px-5 py-3 text-base font-semibold text-slate-800 hover:bg-amber-200/80 disabled:opacity-50"
                >
                  야외 경화
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOrder(popupOrder);
                  setPopupOrder(null);
                }}
                disabled={!canWriteOrders(user)}
                className="rounded-xl border border-red-500/80 bg-red-500/90 px-5 py-3 text-base font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                삭제
              </button>
            </div>
            {!canWriteOrders(user) && (
              <div className="text-base text-slate-400">
                현재 권한에서는 직접 수정/출하할 수 없습니다.
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={outdoorConfirmOrder !== null}
        onClose={() => {
          if (!outdoorConfirmBusy) setOutdoorConfirmOrder(null);
        }}
        title="야외 경화"
        titleSize="lg"
      >
        {outdoorConfirmOrder && (
          <div className="flex flex-col gap-4 text-base">
            <p className="text-slate-200">
              야외 경화 상태로 변경하시겠습니까?
            </p>
            <div className="flex justify-end gap-3">
              <SecondaryButton
                onClick={() => {
                  if (!outdoorConfirmBusy) setOutdoorConfirmOrder(null);
                }}
                size="lg"
              >
                취소
              </SecondaryButton>
              <PrimaryButton
                onClick={handleConfirmOutdoorHardening}
                disabled={outdoorConfirmBusy}
                size="lg"
              >
                확인
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={deleteConfirmOrder !== null}
        onClose={() => {
          if (!deleteOrderBusy) {
            setDeleteConfirmOrder(null);
            setDeleteOrderError(null);
          }
        }}
        title="파종 기록 삭제"
        titleSize="lg"
      >
        {deleteConfirmOrder && (
          <div className="flex flex-col gap-4 text-base">
            <p className="text-slate-200">
              이 파종 기록을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.
            </p>
            <div className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2 text-slate-300">
              {deleteConfirmOrder.customer_name} / {deleteConfirmOrder.crop_name} · 파종일:{" "}
              {deleteConfirmOrder.sowing_date}
            </div>
            {deleteOrderError && (
              <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-200">
                {deleteOrderError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <SecondaryButton
                onClick={() => {
                  if (!deleteOrderBusy) {
                    setDeleteConfirmOrder(null);
                    setDeleteOrderError(null);
                  }
                }}
                size="lg"
              >
                취소
              </SecondaryButton>
              <button
                type="button"
                onClick={() => void handleDeleteOrderConfirm()}
                disabled={deleteOrderBusy}
                className="rounded-xl border border-red-500/80 bg-red-500/90 px-5 py-3 text-base font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                삭제
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={shippingOnlyOrder !== null}
        onClose={() => {
          if (!shippingOnlyBusy) setShippingOnlyOrder(null);
        }}
        title="출하 정보 입력"
        titleSize="lg"
      >
        {shippingOnlyOrder && (
          <div className="flex flex-col gap-4 text-base">
            <div className="rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-2 text-slate-300">
              {shippingOnlyOrder.customer_name} / {shippingOnlyOrder.crop_name} · 파종수량:{" "}
              {shippingOnlyOrder.quantity_base}+{shippingOnlyOrder.quantity_extra}
            </div>
            <DateWheel
              label="출하일자"
              value={shippingOnlyDate}
              onChange={setShippingOnlyDate}
              size="lg"
            />
            <div className="flex flex-col gap-2">
              <TextField
                label="출하수량"
                value={shippingOnlyQty}
                onChange={setShippingOnlyQty}
                type="number"
                size="lg"
              />
              <button
                type="button"
                onClick={() =>
                  setShippingOnlyQty(
                    String(
                      shippingOnlyOrder.quantity_base + shippingOnlyOrder.quantity_extra,
                    ),
                  )
                }
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-100 hover:bg-slate-800"
              >
                파종수량과 동일
              </button>
            </div>
            <div className="mt-2 flex justify-end gap-3">
              <SecondaryButton
                onClick={() => {
                  if (!shippingOnlyBusy) setShippingOnlyOrder(null);
                }}
                size="lg"
              >
                취소
              </SecondaryButton>
              <PrimaryButton onClick={handleSaveShippingOnly} disabled={shippingOnlyBusy} size="lg">
                저장
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>
        </>,
        document.body,
      )}

      {noShippingToast && (
        <div
          className="pointer-events-none fixed z-[70] rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-base text-slate-100 shadow-xl transition-opacity duration-300"
          style={{
            left: noShippingToast.x,
            top: noShippingToast.y,
            transform: "translate(-50%, -100%)",
            opacity: noShippingToast.visible ? 1 : 0,
          }}
          aria-live="polite"
        >
          출하정보가 없어서 수정이 불가합니다
        </div>
      )}
    </div>
  );
}

function MainMenuPage() {
  const { user, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const [roleInfoOpen, setRoleInfoOpen] = React.useState(false);
  React.useEffect(() => {
    if (user?.role_level === 0 && !user.name?.trim()) {
      updateMyName("정효조").then(() => refresh()).catch(() => refresh());
    }
  }, [user?.role_level, user?.name, refresh]);

  const todayStr = getLocalDateString();
  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  })();

  const [todayPlanItems, setTodayPlanItems] = React.useState<SowingPlanItem[]>([]);
  const [ordersAll, setOrdersAll] = React.useState<Order[]>([]);
  const [dailyTodoLines, setDailyTodoLines] = React.useState<string[]>([]);
  const [dailyTodoLinesTomorrow, setDailyTodoLinesTomorrow] = React.useState<string[]>([]);
  const [billboardsLoading, setBillboardsLoading] = React.useState(true);
  const [dailyTodoEditOpen, setDailyTodoEditOpen] = React.useState(false);
  const [dailyTodoEditDate, setDailyTodoEditDate] = React.useState<string>(todayStr);
  const [dailyTodoEditLines, setDailyTodoEditLines] = React.useState<string[]>([]);
  const [dailyTodoSaving, setDailyTodoSaving] = React.useState(false);
  const [dailyTodoSaveError, setDailyTodoSaveError] = React.useState<string | null>(null);
  const [billboardExpanded, setBillboardExpanded] = React.useState<[boolean, boolean, boolean, boolean]>([true, true, false, false]);
  const [unprocessedPendingCount, setUnprocessedPendingCount] = React.useState(0);
  const hasAutoExpandedTodayTodo = React.useRef(false);
  const hasAutoExpandedTomorrowTodo = React.useRef(false);

  React.useEffect(() => {
    if (dailyTodoLines.length > 0 && !hasAutoExpandedTodayTodo.current) {
      hasAutoExpandedTodayTodo.current = true;
      setBillboardExpanded((prev) => [prev[0], prev[1], true, prev[3]]);
    }
  }, [dailyTodoLines.length]);
  React.useEffect(() => {
    if (dailyTodoLinesTomorrow.length > 0 && !hasAutoExpandedTomorrowTodo.current) {
      hasAutoExpandedTomorrowTodo.current = true;
      setBillboardExpanded((prev) => [prev[0], prev[1], prev[2], true]);
    }
  }, [dailyTodoLinesTomorrow.length]);

  const toggleBillboard = (index: 0 | 1 | 2 | 3) => {
    setBillboardExpanded((prev) => {
      const next = [...prev] as [boolean, boolean, boolean, boolean];
      next[index] = !next[index];
      return next;
    });
  };

  React.useEffect(() => {
    if (!isSupabaseConfigured) {
      setBillboardsLoading(false);
      return;
    }
    let cancelled = false;
    setBillboardsLoading(true);
    (async () => {
      try {
        const [planRes, ordersRes, todosTodayRes, todosTomorrowRes, pendingCount] = await Promise.all([
          fetchSowingPlanItems(todayStr, todayStr),
          supabase.from("orders").select("*"),
          fetchDailyTodos(todayStr).catch(() => []),
          fetchDailyTodos(tomorrowStr).catch(() => []),
          fetchUnprocessedPendingCount().catch(() => 0),
        ]);
        if (cancelled) return;
        setTodayPlanItems(planRes ?? []);
        setOrdersAll((ordersRes.data as Order[]) ?? []);
        setDailyTodoLines(Array.isArray(todosTodayRes) ? todosTodayRes : []);
        setDailyTodoLinesTomorrow(Array.isArray(todosTomorrowRes) ? todosTomorrowRes : []);
        const count = typeof pendingCount === "number" ? pendingCount : 0;
        setUnprocessedPendingCount(count);
        setAppIconBadge(count);
      } finally {
        if (!cancelled) setBillboardsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [todayStr, tomorrowStr]);

  const ordersMovedToIndoorToday = React.useMemo(() => {
    return ordersAll.filter((o) => getOrderIndoorStartDate(o) === todayStr);
  }, [ordersAll, todayStr]);

  const canEditTodos = canEditDailyTodos(user);

  const openDailyTodoEdit = (date: string, lines: string[]) => {
    setDailyTodoEditDate(date);
    setDailyTodoEditLines(lines.length > 0 ? [...lines] : [""]);
    setDailyTodoSaveError(null);
    setDailyTodoEditOpen(true);
  };
  const saveDailyTodoEdit = async () => {
    if (!user) return;
    if (!isSupabaseConfigured) {
      setDailyTodoSaveError("Supabase가 연결되지 않아 저장할 수 없습니다.");
      return;
    }
    const saved = dailyTodoEditLines.filter((l) => l.trim() !== "");
    setDailyTodoSaving(true);
    setDailyTodoSaveError(null);
    try {
      await saveDailyTodos(dailyTodoEditDate, saved, user.id);
      if (dailyTodoEditDate === todayStr) {
        setDailyTodoLines(saved);
      } else {
        setDailyTodoLinesTomorrow(saved);
      }
      setDailyTodoEditOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "저장에 실패했습니다.";
      setDailyTodoSaveError(msg);
    } finally {
      setDailyTodoSaving(false);
    }
  };

  if (!user) return <Navigate to="/" replace />;

  const isAdmin = user.role_level === 0;

  const tiles = [
    {
      key: "status",
      title: "파종 및 출하현황",
      to: "/dashboard",
      icon: (
        <svg viewBox="0 0 40 40" className="h-11 w-11 text-emerald-300">
          <rect x="4" y="8" width="32" height="24" rx="4" className="fill-emerald-500/20" />
          <path
            d="M10 22l5-6 5 4 6-8 4 4"
            className="stroke-emerald-300"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      key: "plan",
      title: "주문 및 파종계획",
      to: "/planning",
      icon: (
        <svg viewBox="0 0 40 40" className="h-11 w-11 text-sky-300">
          <rect x="8" y="9" width="24" height="24" rx="4" className="fill-sky-500/15" />
          <path
            d="M14 13h12M14 18h9M14 23h6"
            className="stroke-sky-300"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="27" cy="24" r="4" className="fill-sky-400/80" />
        </svg>
      ),
    },
    {
      key: "certificate",
      title: "육묘확인서 발급",
      to: "/certificate",
      icon: (
        <svg viewBox="0 0 40 40" className="h-11 w-11 text-amber-300">
          <rect x="10" y="6" width="20" height="28" rx="3" className="fill-amber-500/15" />
          <path
            d="M14 14h12M14 19h10M14 24h8"
            className="stroke-amber-200"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="29" cy="29" r="4" className="fill-amber-400/80" />
        </svg>
      ),
    },
    {
      key: "admin",
      title: "관리자 메뉴",
      to: "/admin",
      icon: (
        <svg viewBox="0 0 40 40" className="h-11 w-11 text-rose-300">
          <circle cx="20" cy="14" r="5" className="fill-rose-400/80" />
          <path
            d="M10 30c1.8-4 5.2-6 10-6s8.2 2 10 6"
            className="stroke-rose-300"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="10" cy="12" r="2" className="fill-rose-500/40" />
          <circle cx="30" cy="12" r="2" className="fill-rose-500/40" />
        </svg>
      ),
      disabled: !isAdmin,
    },
  ];

  const billboardBase =
    "rounded-xl border-2 border-slate-600/80 bg-slate-900/95 shadow-[inset_0_0_30px_rgba(0,0,0,0.5),0_4px_20px_rgba(0,0,0,0.4)] overflow-hidden sm:rounded-2xl";

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-50">
      <header className="shrink-0 border-b border-slate-800 bg-slate-950/80 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-0">
          <div className="min-w-0 flex-1 sm:min-w-0">
            <div className="break-words text-[1.35rem] font-extrabold leading-tight tracking-tight sm:text-[2.06rem] md:text-[2.35rem]">
              충주 친환경 육묘장
            </div>
            <div className="hidden text-xs text-slate-400 sm:block">
              제작자 : 정효조(010-2604-6588 / jami6613@gmail.com)
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center justify-end gap-1.5 text-right text-xs sm:gap-3 sm:text-base">
            <span className="max-w-[8rem] truncate text-slate-400 sm:max-w-none">{user.name || user.email}</span>
            <button
              type="button"
              onClick={() => setRoleInfoOpen(true)}
              className="rounded-lg bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700 sm:px-4 sm:py-2"
            >
              {ROLE_LABEL[user.role_level]}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700 sm:px-4 sm:py-2"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <Modal open={roleInfoOpen} title="권한 등급 안내" onClose={() => setRoleInfoOpen(false)}>
        <div className="space-y-2 text-sm text-slate-200">
          {ROLE_LEVELS.map((level) => (
            <div key={level}>
              {ROLE_LABEL[level]}
              {level === user.role_level && (
                <span className="ml-1 text-amber-400">* 현재 나의 등급입니다.</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-slate-700 pt-3 text-xs text-slate-400">
          권한에 관한 문의는 최고관리자에게 문의바랍니다 (정효조 / 010-2604-6588)
        </p>
      </Modal>

      <main className="flex min-h-0 flex-1 flex-col overflow-auto px-3 py-3 sm:px-4 sm:py-4">
        {/* 전광판 3개: 내용이 많아지면 자연히 커지고, 그 아래 메뉴 버튼이 밀려남. 전체가 화면을 넘으면 스크롤. */}
        <section className="flex shrink-0 flex-col gap-2 pb-2 sm:gap-3 sm:pb-3">
          {/* 1. 오늘의 파종 */}
          <div className={billboardBase}>
            <button
              type="button"
              onClick={() => toggleBillboard(0)}
              className="flex w-full items-center justify-center gap-1.5 border-b border-amber-500/50 bg-amber-950/60 px-3 py-1.5 text-center sm:px-4 sm:py-2"
            >
              <span className="text-sm font-bold tracking-widest text-amber-200 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)] sm:text-lg">
                ▼ 오늘의 파종 ▼
              </span>
              <span className="text-[10px] text-amber-200/80 sm:text-xs">
                {billboardExpanded[0] ? "접기" : "펼치기"}
              </span>
            </button>
            {billboardExpanded[0] && (
            <div className="min-h-[3rem] px-3 py-2 sm:min-h-[4rem] sm:px-4 sm:py-3">
              {billboardsLoading ? (
                <p className="text-center text-xs text-slate-500 sm:text-sm">불러오는 중...</p>
              ) : todayPlanItems.length === 0 ? (
                <p className="text-center text-xs text-slate-500 sm:text-sm">오늘 예정된 파종이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5 sm:space-y-2">
                  {todayPlanItems.map((item) => {
                    const trayDisplay =
                      item.tray_type === "직접입력" ? item.tray_custom || "-" : item.tray_type || "-";
                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg bg-slate-800/60 px-3 py-2 text-left text-sm text-slate-200 sm:gap-x-2 sm:gap-y-1 sm:px-4 sm:py-2.5 sm:text-lg"
                      >
                        <span className="text-slate-300">{item.orderer || "-"}</span>
                        <span className="text-slate-500">│</span>
                        <span className="font-medium text-slate-100">{item.crop || "(작물명 없음)"}</span>
                        <span className="text-slate-500">│</span>
                        <span className="text-slate-300">{item.seed_owner || "-"}</span>
                        <span className="text-slate-500">│</span>
                        <span className="text-slate-300">{trayDisplay}</span>
                        <span className="text-slate-500">│</span>
                        <span className="font-mono text-amber-300">{item.quantity || "-"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            )}
          </div>

          {/* 2. 발아실 -> 실내 육묘 */}
          <div className={billboardBase}>
            <button
              type="button"
              onClick={() => toggleBillboard(1)}
              className="flex w-full items-center justify-center gap-1.5 border-b border-emerald-500/50 bg-emerald-950/60 px-3 py-1.5 text-center sm:px-4 sm:py-2"
            >
              <span className="text-sm font-bold tracking-widest text-emerald-200 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)] sm:text-lg">
                ▼ 발아실 → 실내 육묘 ▼
              </span>
              <span className="text-[10px] text-emerald-200/80 sm:text-xs">
                {billboardExpanded[1] ? "접기" : "펼치기"}
              </span>
            </button>
            {billboardExpanded[1] && (
            <div className="min-h-[3rem] px-3 py-2 sm:min-h-[4rem] sm:px-4 sm:py-3">
              {billboardsLoading ? (
                <p className="text-center text-xs text-slate-500 sm:text-sm">불러오는 중...</p>
              ) : ordersMovedToIndoorToday.length === 0 ? (
                <p className="text-center text-xs text-slate-500 sm:text-sm">오늘 실내 육묘로 전환된 작물이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5 sm:space-y-2">
                  {ordersMovedToIndoorToday.map((o) => {
                    const [y, m, d] = (o.sowing_date || "").split("-");
                    const dateLabel = m && d ? `${m}월 ${d}일` : "";
                    return (
                      <li
                        key={o.id}
                        className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg bg-slate-800/60 px-3 py-2 text-left text-sm text-slate-200 sm:gap-x-2 sm:gap-y-1 sm:px-4 sm:py-2.5 sm:text-lg"
                      >
                        <span className="text-slate-300">{dateLabel} 파종</span>
                        <span className="text-slate-500">│</span>
                        <span className="text-slate-300">{o.customer_name}</span>
                        <span className="text-slate-500">│</span>
                        <span className="font-medium text-slate-100">{o.crop_name}</span>
                        <span className="text-slate-500">│</span>
                        <span className="font-mono text-emerald-300">
                          {o.quantity_base}+{o.quantity_extra}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            )}
          </div>

          {/* 3. 오늘의 할 일 */}
          <div className={billboardBase}>
            <div className="flex items-center justify-between border-b border-sky-500/50 bg-sky-950/60 px-3 py-1.5 sm:px-4 sm:py-2">
              <button
                type="button"
                onClick={() => toggleBillboard(2)}
                className="flex flex-1 items-center justify-center gap-1.5"
              >
                <span className="text-sm font-bold tracking-widest text-sky-200 drop-shadow-[0_0_8px_rgba(56,189,248,0.4)] sm:text-lg">
                  ▼ 오늘의 할 일 ▼
                </span>
                <span className="text-[10px] text-sky-200/80 sm:text-xs">
                  {billboardExpanded[2] ? "접기" : "펼치기"}
                </span>
              </button>
              {canEditTodos && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openDailyTodoEdit(todayStr, dailyTodoLines); }}
                  className="rounded-lg bg-sky-700/80 px-2 py-1 text-xs font-medium text-sky-100 hover:bg-sky-600 sm:px-3 sm:py-1.5 sm:text-sm"
                >
                  편집
                </button>
              )}
            </div>
            {billboardExpanded[2] && (
            <div className="min-h-[3rem] px-3 py-2 sm:min-h-[4rem] sm:px-4 sm:py-3">
              {billboardsLoading ? (
                <p className="text-center text-xs text-slate-500 sm:text-sm">불러오는 중...</p>
              ) : dailyTodoLines.length === 0 ? (
                <p className="text-center text-xs text-slate-500 sm:text-sm">
                  {canEditTodos ? "편집 버튼으로 할 일을 추가해 보세요." : "등록된 할 일이 없습니다."}
                </p>
              ) : (
                <ul className="space-y-1 sm:space-y-1.5">
                  {dailyTodoLines.map((line, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-slate-800/60 px-2.5 py-1.5 text-sm text-slate-200 sm:px-3 sm:py-2 sm:text-base"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            )}
          </div>

          {/* 4. 내일의 할 일 */}
          <div className={billboardBase}>
            <div className="flex items-center justify-between border-b border-violet-500/50 bg-violet-950/60 px-3 py-1.5 sm:px-4 sm:py-2">
              <button
                type="button"
                onClick={() => toggleBillboard(3)}
                className="flex flex-1 items-center justify-center gap-1.5"
              >
                <span className="text-sm font-bold tracking-widest text-violet-200 drop-shadow-[0_0_8px_rgba(139,92,246,0.4)] sm:text-lg">
                  ▼ 내일의 할 일 ▼
                </span>
                <span className="text-[10px] text-violet-200/80 sm:text-xs">
                  {billboardExpanded[3] ? "접기" : "펼치기"}
                </span>
              </button>
              {canEditTodos && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openDailyTodoEdit(tomorrowStr, dailyTodoLinesTomorrow); }}
                  className="rounded-lg bg-violet-700/80 px-2 py-1 text-xs font-medium text-violet-100 hover:bg-violet-600 sm:px-3 sm:py-1.5 sm:text-sm"
                >
                  편집
                </button>
              )}
            </div>
            {billboardExpanded[3] && (
            <div className="min-h-[3rem] px-3 py-2 sm:min-h-[4rem] sm:px-4 sm:py-3">
              {billboardsLoading ? (
                <p className="text-center text-xs text-slate-500 sm:text-sm">불러오는 중...</p>
              ) : dailyTodoLinesTomorrow.length === 0 ? (
                <p className="text-center text-xs text-slate-500 sm:text-sm">
                  {canEditTodos ? "편집 버튼으로 할 일을 추가해 보세요." : "등록된 할 일이 없습니다."}
                </p>
              ) : (
                <ul className="space-y-1 sm:space-y-1.5">
                  {dailyTodoLinesTomorrow.map((line, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-slate-800/60 px-2.5 py-1.5 text-sm text-slate-200 sm:px-3 sm:py-2 sm:text-base"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            )}
          </div>
        </section>

        {/* 하단 절반: 메뉴 버튼 4개 (모바일 2x2, PC도 2열) */}
        <section className="shrink-0 pt-1">
          <div className="grid w-full max-w-3xl mx-auto grid-cols-2 gap-3 sm:gap-4">
            {tiles.map((tile) => {
              const disabled = tile.disabled;
              const content = (
                <div
                  className={`relative flex min-h-[5.5rem] sm:min-h-40 flex-col justify-center overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 px-3 py-3 sm:px-5 sm:py-4 shadow-[0_12px_30px_rgba(0,0,0,0.5)] transition-transform transition-shadow ${
                    disabled
                      ? "opacity-50"
                      : "hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
                  }`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.2),transparent_55%)] opacity-80" />
                  {tile.key === "plan" && unprocessedPendingCount > 0 && (
                    <span
                      className="absolute right-1.5 top-1.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[0.65rem] font-bold leading-none text-white shadow-md sm:right-2 sm:top-2 sm:min-w-[1.25rem] sm:px-1.5 sm:py-0.5 sm:text-xs"
                      aria-label={`미반영 주문 ${unprocessedPendingCount}건`}
                    >
                      {unprocessedPendingCount > 99 ? "99+" : unprocessedPendingCount}
                    </span>
                  )}
                  <div className="relative flex items-center gap-2 sm:gap-4">
                    <div className="shrink-0 rounded-xl bg-slate-900/80 p-2 sm:p-3 shadow-inner [&_svg]:h-8 [&_svg]:w-8 sm:[&_svg]:h-11 sm:[&_svg]:w-11">
                      {tile.icon}
                    </div>
                    <div
                      className={`min-w-0 text-base font-semibold text-slate-50/95 leading-tight sm:text-2xl ${
                        tile.key === "plan"
                          ? "whitespace-nowrap tracking-[-0.04em] sm:tracking-[-0.02em]"
                          : "tracking-tight"
                      }`}
                    >
                      {tile.title}
                    </div>
                  </div>
                </div>
              );

              if (disabled) {
                return (
                  <div key={tile.key} className="cursor-not-allowed">
                    {content}
                  </div>
                );
              }
              return (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => navigate(tile.to)}
                  className="text-left"
                >
                  {content}
                </button>
              );
            })}
          </div>
        </section>
      </main>

      {/* 오늘/내일의 할 일 편집 모달 */}
      <Modal
        open={dailyTodoEditOpen}
        title={dailyTodoEditDate === tomorrowStr ? "내일의 할 일 편집" : "오늘의 할 일 편집"}
        onClose={() => {
            if (dailyTodoSaving) return;
            setDailyTodoSaveError(null);
            setDailyTodoEditOpen(false);
          }}
      >
        <div className="space-y-2">
          {dailyTodoSaveError && (
            <p className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-200">
              {dailyTodoSaveError}
            </p>
          )}
          <p className="text-sm text-slate-400">한 줄씩 입력하세요. 빈 줄은 저장 시 제외됩니다.</p>
          {dailyTodoEditLines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={line}
                onChange={(e) => {
                  const next = [...dailyTodoEditLines];
                  next[i] = e.target.value;
                  setDailyTodoEditLines(next);
                }}
                className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500"
                placeholder="할 일 한 줄"
              />
              <button
                type="button"
                onClick={() =>
                  setDailyTodoEditLines(dailyTodoEditLines.filter((_, j) => j !== i))
                }
                className="rounded-lg bg-slate-700 px-3 py-2 text-slate-300 hover:bg-slate-600"
              >
                삭제
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDailyTodoEditLines([...dailyTodoEditLines, ""])}
              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
            >
              + 줄 추가
            </button>
            <button
              type="button"
              onClick={() => setDailyTodoEditLines([])}
              disabled={dailyTodoSaving || dailyTodoEditLines.length === 0}
              className="rounded-lg border border-red-800 bg-red-900/50 px-4 py-2 text-sm text-red-200 hover:bg-red-800/70 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              전체삭제
            </button>
            <SecondaryButton onClick={() => !dailyTodoSaving && setDailyTodoEditOpen(false)}>
              취소
            </SecondaryButton>
            <PrimaryButton onClick={() => void saveDailyTodoEdit()} disabled={dailyTodoSaving}>
              {dailyTodoSaving ? "저장 중…" : "저장"}
            </PrimaryButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const PLAN_WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const PLAN_MONTH_KO = "1월,2월,3월,4월,5월,6월,7월,8월,9월,10월,11월,12월".split(",");
function planDateHeader(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const w = PLAN_WEEKDAY_KO[d.getDay()];
  return `${String(m).padStart(2, "0")}월 ${String(day).padStart(2, "0")}일 ${w}`;
}
function getThreeDaysFrom(focusDate: string): string[] {
  const d = new Date(focusDate + "T00:00:00");
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    out.push(
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`,
    );
  }
  return out;
}
function planQuantityDisplay(base: string, extra: string): string {
  const b = base.trim();
  const e = extra.trim();
  return e ? `${b || "-"}+${e}` : (b || "-");
}
function planQuantityParse(quantity: string): { base: string; extra: string } {
  const i = quantity.indexOf("+");
  if (i >= 0)
    return { base: quantity.slice(0, i).trim(), extra: quantity.slice(i + 1).trim() };
  return { base: quantity.trim(), extra: "" };
}
/** "50+1" → 51, "100+4" → 104 (트레이 개수 합산용) */
function planQuantityToTotal(quantity: string): number {
  const { base, extra } = planQuantityParse(quantity || "");
  const b = parseInt(base, 10) || 0;
  const e = parseInt(extra, 10) || 0;
  return b + e;
}

const UNPROCESSED_PAGE_SIZE = 20;
const UNPROCESSED_MAX_PAGES = 10;
const MAX_UNPROCESSED = UNPROCESSED_PAGE_SIZE * UNPROCESSED_MAX_PAGES; // 200
const PLAN_DATE_DAYS_AGO = 60;
const PLAN_DATE_DAYS_AHEAD = 30;

function getPlanAllowedRange(): { min: string; max: string } {
  const t = new Date();
  const minD = new Date(t);
  minD.setDate(minD.getDate() - PLAN_DATE_DAYS_AGO);
  const maxD = new Date(t);
  maxD.setDate(maxD.getDate() + PLAN_DATE_DAYS_AHEAD);
  return {
    min: getLocalDateString(minD),
    max: getLocalDateString(maxD),
  };
}
function clampPlanDate(dateStr: string): string {
  const { min, max } = getPlanAllowedRange();
  if (dateStr < min) return min;
  if (dateStr > max) return max;
  return dateStr;
}

/** 본인 글이거나, 상위 등급(숫자 작음)이 하위 등급 작성자 글일 때 수정/삭제 가능 */
function canEditDeleteUnprocessedOrder(
  user: { id: string; role_level: number } | null,
  order: UnprocessedOrder,
): boolean {
  if (!user) return false;
  if (order.deleted_at) return false;
  if (order.created_by === user.id) return true;
  const authorLevel = order.created_by_role_level ?? 3;
  return user.role_level < authorLevel; // 숫자 작을수록 상위 등급
}

function PlanningPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = React.useState(() => new Date());
  const [roleInfoOpen, setRoleInfoOpen] = React.useState(false);
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const [focusDate, setFocusDate] = React.useState(() =>
    clampPlanDate(getLocalDateString()),
  );
  const [planItems, setPlanItems] = React.useState<SowingPlanItem[]>([]);
  const [unprocessed, setUnprocessed] = React.useState<UnprocessedOrder[]>([]);
  const [unprocessedPage, setUnprocessedPage] = React.useState(1);
  const [planLoading, setPlanLoading] = React.useState(false);
  const [unprocessedLoading, setUnprocessedLoading] = React.useState(false);
  const [addPlanOpen, setAddPlanOpen] = React.useState<string | null>(null);
  const [addPlanForm, setAddPlanForm] = React.useState({
    orderer: "",
    crop: "",
    quantity_base: "",
    quantity_extra: "",
    tray_type: "200",
    tray_custom: "",
    seed_owner: "육묘장" as SeedOwner,
  });
  const [addPlanBusy, setAddPlanBusy] = React.useState(false);
  const [addPlanError, setAddPlanError] = React.useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [calendarYear, setCalendarYear] = React.useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = React.useState(new Date().getMonth() + 1);
  const [planCounts, setPlanCounts] = React.useState<Record<string, number>>({});
  const [addUnprocessedOpen, setAddUnprocessedOpen] = React.useState(false);
  const [addUnprocessedText, setAddUnprocessedText] = React.useState("");
  const [addUnprocessedBusy, setAddUnprocessedBusy] = React.useState(false);
  const [addUnprocessedError, setAddUnprocessedError] = React.useState<string | null>(null);
  const [reflectOrder, setReflectOrder] = React.useState<UnprocessedOrder | null>(null);
  const [reflectDate, setReflectDate] = React.useState("");
  const [reflectForm, setReflectForm] = React.useState({
    orderer: "",
    crop: "",
    quantity_base: "",
    quantity_extra: "",
    tray_type: "200",
    tray_custom: "",
    seed_owner: "육묘장" as SeedOwner,
  });
  const [reflectDateOpen, setReflectDateOpen] = React.useState(false);
  const [reflectBusy, setReflectBusy] = React.useState(false);
  const [unreflectOrder, setUnreflectOrder] = React.useState<UnprocessedOrder | null>(null);
  const [unreflectBusy, setUnreflectBusy] = React.useState(false);
  const [postActionOrder, setPostActionOrder] = React.useState<UnprocessedOrder | null>(null);
  const [editOrder, setEditOrder] = React.useState<UnprocessedOrder | null>(null);
  const [editOrderContent, setEditOrderContent] = React.useState("");
  const [editOrderBusy, setEditOrderBusy] = React.useState(false);
  const [deleteOrder, setDeleteOrder] = React.useState<UnprocessedOrder | null>(null);
  const [deletedPostViewOrder, setDeletedPostViewOrder] = React.useState<UnprocessedOrder | null>(null);
  const [deleteOrderBusy, setDeleteOrderBusy] = React.useState(false);
  const [noReflectToast, setNoReflectToast] = React.useState<{
    show: boolean;
    x: number;
    y: number;
    fading?: boolean;
  } | null>(null);
  const [deletedPostToast, setDeletedPostToast] = React.useState<{
    show: boolean;
    x: number;
    y: number;
    fading?: boolean;
  } | null>(null);
  const [planItemPopup, setPlanItemPopup] = React.useState<SowingPlanItem | null>(null);
  const [planItemEditForm, setPlanItemEditForm] = React.useState({
    orderer: "",
    crop: "",
    quantity_base: "",
    quantity_extra: "",
    tray_type: "200",
    tray_custom: "",
    seed_owner: "육묘장" as SeedOwner,
  });
  const [planItemSaveBusy, setPlanItemSaveBusy] = React.useState(false);
  const [planItemSaveError, setPlanItemSaveError] = React.useState<string | null>(null);
  const [planItemDeleteBusy, setPlanItemDeleteBusy] = React.useState(false);

  const threeDays = React.useMemo(() => getThreeDaysFrom(focusDate), [focusDate]);

  React.useEffect(() => {
    const clamped = clampPlanDate(focusDate);
    if (clamped !== focusDate) setFocusDate(clamped);
  }, [focusDate]);

  const loadPlan = React.useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setPlanLoading(true);
    try {
      const t = new Date();
      const beforeD = new Date(t);
      beforeD.setDate(beforeD.getDate() - PLAN_DATE_DAYS_AGO);
      const beforeDate = getLocalDateString(beforeD);
      await deleteOldSowingPlanItems(beforeDate);
      const items = await fetchSowingPlanItems(threeDays[0], threeDays[2]);
      setPlanItems(items);
    } catch {
      setPlanItems([]);
    } finally {
      setPlanLoading(false);
    }
  }, [threeDays[0], threeDays[2]]);

  const loadUnprocessed = React.useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setUnprocessedLoading(true);
    try {
      await deleteOldSoftDeletedUnprocessedOrders();
      const list = await fetchUnprocessedOrders();
      setUnprocessed(list);
    } catch {
      setUnprocessed([]);
    } finally {
      setUnprocessedLoading(false);
    }
  }, []);

  const loadCalendarCounts = React.useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const counts = await fetchPlanCountsByDate(calendarYear, calendarMonth);
      setPlanCounts(counts);
    } catch {
      setPlanCounts({});
    }
  }, [calendarYear, calendarMonth]);

  React.useEffect(() => {
    void loadPlan();
  }, [loadPlan]);
  React.useEffect(() => {
    void loadUnprocessed();
  }, [loadUnprocessed]);

  const unprocessedPendingCount = React.useMemo(
    () => unprocessed.filter((o) => !o.deleted_at && !o.reflected_at).length,
    [unprocessed],
  );
  React.useEffect(() => {
    setAppIconBadge(unprocessedPendingCount);
  }, [unprocessedPendingCount]);

  const totalUnprocessedPages = Math.min(
    UNPROCESSED_MAX_PAGES,
    Math.max(1, Math.ceil(unprocessed.length / UNPROCESSED_PAGE_SIZE)),
  );
  React.useEffect(() => {
    if (unprocessedPage > totalUnprocessedPages)
      setUnprocessedPage(Math.max(1, totalUnprocessedPages));
  }, [totalUnprocessedPages, unprocessedPage]);
  React.useEffect(() => {
    if (calendarOpen) void loadCalendarCounts();
  }, [calendarOpen, loadCalendarCounts]);

  React.useEffect(() => {
    if (!noReflectToast?.show || noReflectToast.fading) return;
    const t = setTimeout(() => {
      setNoReflectToast((prev) => (prev ? { ...prev, fading: true } : null));
    }, 2000);
    return () => clearTimeout(t);
  }, [noReflectToast?.show, noReflectToast?.fading]);
  React.useEffect(() => {
    if (!noReflectToast?.fading) return;
    const t = setTimeout(() => setNoReflectToast(null), 300);
    return () => clearTimeout(t);
  }, [noReflectToast?.fading]);

  React.useEffect(() => {
    if (!deletedPostToast?.show || deletedPostToast.fading) return;
    const t = setTimeout(() => {
      setDeletedPostToast((prev) => (prev ? { ...prev, fading: true } : null));
    }, 1000);
    return () => clearTimeout(t);
  }, [deletedPostToast?.show, deletedPostToast?.fading]);
  React.useEffect(() => {
    if (!deletedPostToast?.fading) return;
    const t = setTimeout(() => setDeletedPostToast(null), 300);
    return () => clearTimeout(t);
  }, [deletedPostToast?.fading]);

  const showDeletedPostToast = (e: React.MouseEvent | React.TouchEvent) => {
    const touch = "changedTouches" in e && e.changedTouches?.length ? e.changedTouches[0] : "touches" in e && e.touches?.length ? e.touches[0] : null;
    const x = touch ? touch.clientX : (e as React.MouseEvent).clientX;
    const y = touch ? touch.clientY : (e as React.MouseEvent).clientY;
    setDeletedPostToast({ show: true, x, y });
  };

  const handleAddPlanSubmit = async () => {
    if (!user || !addPlanOpen) return;
    setAddPlanBusy(true);
    setAddPlanError(null);
    try {
      const quantity = planQuantityDisplay(addPlanForm.quantity_base, addPlanForm.quantity_extra);
      const item = await addSowingPlanItem(
        addPlanOpen,
        addPlanForm.orderer,
        addPlanForm.crop,
        quantity,
        user.id,
        undefined,
        addPlanForm.tray_type,
        addPlanForm.tray_type === "직접입력" ? addPlanForm.tray_custom : "",
        addPlanForm.seed_owner,
      );
      if (item) {
        setPlanItems((prev) => [...prev, item].sort((a, b) => a.plan_date.localeCompare(b.plan_date) || a.created_at.localeCompare(b.created_at)));
        setAddPlanOpen(null);
        setAddPlanForm({
          orderer: "",
          crop: "",
          quantity_base: "",
          quantity_extra: "",
          tray_type: "200",
          tray_custom: "",
          seed_owner: "육묘장",
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "등록에 실패했습니다.";
      const hint = /column.*does not exist|tray_type|tray_custom|seed_owner/i.test(msg)
        ? " Supabase에서 supabase-sowing-plan-tray-seed.sql 을 실행했는지 확인하세요."
        : "";
      setAddPlanError(msg + hint);
    } finally {
      setAddPlanBusy(false);
    }
  };

  const handleAddUnprocessedSubmit = async () => {
    if (!user || !addUnprocessedText.trim()) return;
    setAddUnprocessedError(null);
    setAddUnprocessedBusy(true);
    try {
      const order = await addUnprocessedOrder(
        addUnprocessedText.trim(),
        user.id,
        (user.name || user.email) ?? null,
        user.role_level,
      );
      let next = [order, ...unprocessed];
      if (next.length > MAX_UNPROCESSED) {
        const sorted = [...next].sort((a, b) =>
          (a.created_at || "").localeCompare(b.created_at || ""),
        );
        const toDelete = sorted.slice(0, next.length - MAX_UNPROCESSED);
        for (const o of toDelete) await deleteUnprocessedOrder(o.id);
        const deleteIds = new Set(toDelete.map((d) => d.id));
        next = next.filter((x) => !deleteIds.has(x.id));
      }
      setUnprocessed(next);
      setAddUnprocessedOpen(false);
      setAddUnprocessedText("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "등록에 실패했습니다.";
      setAddUnprocessedError(msg);
    } finally {
      setAddUnprocessedBusy(false);
    }
  };

  const handleReflectConfirm = () => {
    if (!reflectOrder) return;
    setReflectForm({
      orderer: "",
      crop: "",
      quantity_base: "",
      quantity_extra: "",
      tray_type: "200",
      tray_custom: "",
      seed_owner: "육묘장",
    });
    setReflectDate(focusDate);
    setReflectDateOpen(true);
  };

  const handleReflectDateSubmit = async () => {
    if (!user || !reflectOrder || !reflectDate) return;
    setReflectBusy(true);
    try {
      const quantity = planQuantityDisplay(reflectForm.quantity_base, reflectForm.quantity_extra);
      const { ok } = await reflectUnprocessedToPlan(
        reflectOrder.id,
        reflectDate,
        user.id,
        reflectForm.orderer,
        reflectForm.crop,
        quantity,
        reflectForm.tray_type,
        reflectForm.tray_type === "직접입력" ? reflectForm.tray_custom : "",
        reflectForm.seed_owner,
      );
      if (ok) {
        setUnprocessed((prev) =>
          prev.map((o) =>
            o.id === reflectOrder.id
              ? {
                  ...o,
                  reflected_at: new Date().toISOString(),
                  reflected_plan_date: reflectDate,
                }
              : o,
          ),
        );
        void loadPlan();
        setReflectDateOpen(false);
        setReflectOrder(null);
        setReflectForm({
          orderer: "",
          crop: "",
          quantity_base: "",
          quantity_extra: "",
          tray_type: "200",
          tray_custom: "",
          seed_owner: "육묘장",
        });
      }
    } finally {
      setReflectBusy(false);
    }
  };

  const handleEditOrderSubmit = async () => {
    if (!editOrder) return;
    setEditOrderBusy(true);
    try {
      const updated = await updateUnprocessedOrder(editOrder.id, editOrderContent);
      setUnprocessed((prev) => prev.map((o) => (o.id === editOrder.id ? updated : o)));
      setEditOrder(null);
      setEditOrderContent("");
      setPostActionOrder(null);
    } finally {
      setEditOrderBusy(false);
    }
  };

  const handleDeleteOrderConfirm = async () => {
    if (!deleteOrder) return;
    setDeleteOrderBusy(true);
    try {
      const updated = await deleteUnprocessedOrder(deleteOrder.id);
      setUnprocessed((prev) => prev.map((o) => (o.id === deleteOrder.id ? updated : o)));
      setDeleteOrder(null);
      setPostActionOrder(null);
    } finally {
      setDeleteOrderBusy(false);
    }
  };

  const handleUnreflectSubmit = async () => {
    if (!unreflectOrder) return;
    setUnreflectBusy(true);
    try {
      await unreflectUnprocessedOrder(unreflectOrder.id);
      setUnprocessed((prev) =>
        prev.map((o) =>
          o.id === unreflectOrder.id
            ? { ...o, reflected_at: null, reflected_plan_date: null }
            : o,
        ),
      );
      void loadPlan();
      setUnreflectOrder(null);
    } finally {
      setUnreflectBusy(false);
    }
  };

  const handlePlanItemSave = async () => {
    if (!planItemPopup) return;
    setPlanItemSaveBusy(true);
    setPlanItemSaveError(null);
    try {
      const quantity = planQuantityDisplay(planItemEditForm.quantity_base, planItemEditForm.quantity_extra);
      const updated = await updateSowingPlanItem(planItemPopup.id, {
        orderer: planItemEditForm.orderer,
        crop: planItemEditForm.crop,
        quantity,
        tray_type: planItemEditForm.tray_type,
        tray_custom: planItemEditForm.tray_type === "직접입력" ? planItemEditForm.tray_custom : "",
        seed_owner: planItemEditForm.seed_owner,
      });
      if (updated) {
        const merged: SowingPlanItem = {
          ...updated,
          tray_type: planItemEditForm.tray_type,
          tray_custom: planItemEditForm.tray_type === "직접입력" ? planItemEditForm.tray_custom : "",
          seed_owner: planItemEditForm.seed_owner,
        };
        setPlanItems((prev) =>
          prev.map((p) => (p.id === planItemPopup.id ? merged : p)),
        );
        setPlanItemPopup(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "수정에 실패했습니다.";
      const hint = /column.*does not exist|tray_type|tray_custom|seed_owner/i.test(msg)
        ? " Supabase에서 supabase-sowing-plan-tray-seed.sql 을 실행했는지 확인하세요."
        : "";
      setPlanItemSaveError(msg + hint);
    } finally {
      setPlanItemSaveBusy(false);
    }
  };

  const handlePlanItemDelete = async () => {
    if (!planItemPopup) return;
    const msg = planItemPopup.source_unprocessed_id
      ? "이 파종계획을 삭제하면 연결된 미처리 주문도 반영 전 상태로 돌아갑니다. 삭제하시겠습니까?"
      : "이 파종계획을 삭제하시겠습니까?";
    if (!window.confirm(msg)) return;
    setPlanItemDeleteBusy(true);
    try {
      const { sourceUnprocessedId } = await deleteSowingPlanItem(planItemPopup.id);
      setPlanItems((prev) => prev.filter((p) => p.id !== planItemPopup.id));
      if (sourceUnprocessedId) {
        setUnprocessed((prev) =>
          prev.map((o) =>
            o.id === sourceUnprocessedId
              ? { ...o, reflected_at: null, reflected_plan_date: null }
              : o,
          ),
        );
      }
      setPlanItemPopup(null);
    } finally {
      setPlanItemDeleteBusy(false);
    }
  };

  const calendarDays = React.useMemo(() => {
    const first = new Date(calendarYear, calendarMonth - 1, 1);
    const last = new Date(calendarYear, calendarMonth, 0);
    const firstDay = first.getDay();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= last.getDate(); i++) days.push(i);
    return days;
  }, [calendarYear, calendarMonth]);

  if (!user) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-0">
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold tracking-tight sm:text-2xl">충주 친환경 육묘장</div>
            <div className="text-xs text-slate-400 sm:text-sm">주문 및 파종계획</div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2.5 text-right text-[0.825rem] sm:gap-3 sm:text-[1.1rem]">
            <button
              type="button"
              onClick={() => setRoleInfoOpen(true)}
              className="rounded-full bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              {ROLE_LABEL[user.role_level]}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              로그아웃
            </button>
            <span className="hidden text-slate-400 sm:inline">{formatDateTimeKO(now)}</span>
            <button
              type="button"
              onClick={() => navigate("/menu")}
              className="rounded-lg bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              메인메뉴
            </button>
          </div>
        </div>
      </header>

      <Modal open={roleInfoOpen} title="권한 등급 안내" onClose={() => setRoleInfoOpen(false)}>
        <div className="space-y-2 text-sm text-slate-200">
          {ROLE_LEVELS.map((level) => (
            <div key={level}>
              {ROLE_LABEL[level]}
              {level === user.role_level && (
                <span className="ml-1 text-amber-400">* 현재 나의 등급입니다.</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-slate-700 pt-3 text-xs text-slate-400">
          권한에 관한 문의는 최고관리자에게 문의바랍니다 (정효조 / 010-2604-6588)
        </p>
      </Modal>

      {/* 권한 없음 토스트 (Lv2/Lv3이 + 버튼 클릭 시) - 화면 안에 고정 표시 */}
      {noReflectToast && (
        <div
          className="pointer-events-none fixed left-4 right-4 top-20 z-[100] mx-auto max-w-[min(20rem,calc(100vw-2rem))] rounded-lg bg-slate-800 px-4 py-3 text-center text-sm font-medium leading-snug text-slate-100 shadow-lg ring-1 ring-slate-700 transition-opacity duration-300"
          style={{
            opacity: noReflectToast.fading ? 0 : 1,
          }}
        >
          권한이 없습니다. 최고관리자에게 문의하세요.
        </div>
      )}

      {/* 삭제된 게시글 클릭 시 토스트 */}
      {deletedPostToast && (
        <div
          className="pointer-events-none fixed z-[100] rounded-lg bg-slate-800 px-5 py-3 text-sm font-medium text-slate-100 shadow-lg ring-1 ring-slate-700 transition-opacity duration-300"
          style={{
            left: deletedPostToast.x,
            top: deletedPostToast.y,
            transform: "translate(-50%, -100%)",
            opacity: deletedPostToast.fading ? 0 : 1,
          }}
        >
          삭제된 게시물입니다
        </div>
      )}

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 상단: 일자별 파종계획 3일 (화면 절반) */}
        <section className="flex min-h-0 flex-1 flex-col border-b border-slate-700 bg-slate-900/50">
          <div className="flex items-center justify-end gap-1.5 px-2 py-1 sm:gap-2 sm:px-3 sm:pr-4">
            {focusDate !== getLocalDateString() && (
              <button
                type="button"
                onClick={() => setFocusDate(clampPlanDate(getLocalDateString()))}
                className="rounded-lg bg-lime-500 px-2 py-1.5 text-xs font-medium text-lime-950 hover:bg-lime-400 sm:px-3 sm:py-2 sm:text-sm"
              >
                오늘 날짜로 다시 이동
              </button>
            )}
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 sm:rounded-xl sm:px-5 sm:py-2.5 sm:text-base"
            >
              전체 파종계획 보기
            </button>
          </div>
          <div className="flex flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-2 pt-1 pb-2 snap-x snap-mandatory sm:overflow-visible sm:snap-none sm:px-3 sm:pb-3">
            {planLoading ? (
              <div className="flex flex-1 items-center justify-center text-slate-400">로딩 중...</div>
            ) : (
              <div className="flex min-h-full flex-1 flex-nowrap gap-3 sm:min-w-0 sm:gap-4">
                {threeDays.map((dateStr) => {
                  const items = planItems.filter((i) => i.plan_date === dateStr);
                  const trayTotals: Record<string, number> = {};
                  for (const item of items) {
                    const trayKey =
                      (item.tray_type === "직접입력" ? (item.tray_custom || "").trim() : (item.tray_type || "").trim()) || "미지정";
                    trayTotals[trayKey] = (trayTotals[trayKey] || 0) + planQuantityToTotal(item.quantity || "");
                  }
                  const traySummaryEntries = Object.entries(trayTotals)
                    .filter(([, n]) => n > 0)
                    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
                  return (
                    <div
                      key={dateStr}
                      className="flex w-[calc(100vw-1rem)] min-w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-shrink-0 snap-start flex-col overflow-hidden rounded-xl border-4 border-slate-400 bg-slate-200/40 sm:w-auto sm:min-w-0 sm:max-w-none sm:flex-1 sm:rounded-2xl"
                      style={{
                        boxShadow:
                          "0 4px 6px -1px rgba(0,0,0,0.12), 0 8px 20px -4px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06) inset",
                      }}
                    >
                      {/* 화이트보드 프레임(상단) */}
                      <div className="flex items-center justify-between border-b-2 border-slate-400 bg-gradient-to-b from-slate-300 to-slate-400 px-3 py-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.3)] sm:px-3 sm:py-3">
                        <span className="flex-1 text-center text-lg font-bold leading-tight text-slate-800 drop-shadow-sm sm:text-xl [font-size:clamp(0.75rem,5vw,1.75rem)]">
                          {planDateHeader(dateStr)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            if (!canAddPlanItem(user)) {
                              setNoReflectToast({ show: true, x: e.clientX, y: e.clientY });
                              return;
                            }
                            setAddPlanOpen(dateStr);
                            setAddPlanError(null);
                            setAddPlanForm({
                              orderer: "",
                              crop: "",
                              quantity_base: "",
                              quantity_extra: "",
                              tray_type: "200",
                              tray_custom: "",
                              seed_owner: "육묘장",
                            });
                          }}
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-500/80 text-white shadow-md hover:bg-slate-600 sm:h-8 sm:w-8"
                        >
                          +
                        </button>
                      </div>
                      {/* 쓰기 면: 파종 내용만 스크롤, 트레이 합계는 하단 고정 */}
                      <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-50/95 to-white">
                        <div
                          className="plan-whiteboard-scroll min-h-0 flex-1 space-y-1 p-2 sm:space-y-1 sm:p-2"
                          style={{
                            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.04)",
                          }}
                        >
                          {items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setPlanItemPopup(item);
                                setPlanItemSaveError(null);
                                const { base, extra } = planQuantityParse(item.quantity || "");
                                const isDirect = item.tray_type === "직접입력";
                                setPlanItemEditForm({
                                  orderer: item.orderer,
                                  crop: item.crop,
                                  quantity_base: base,
                                  quantity_extra: extra,
                                  tray_type: item.tray_type || "200",
                                  tray_custom: isDirect ? item.tray_custom || "" : "",
                                  seed_owner: item.seed_owner || "육묘장",
                                });
                              }}
                              className="flex w-full flex-nowrap items-center gap-x-1 overflow-hidden rounded-lg bg-slate-200/40 px-2 py-1.5 text-left hover:bg-slate-200/60 sm:rounded-lg"
                              style={{
                                fontFamily: "'Malgun Gothic', '맑은 고딕', sans-serif",
                                fontSize: "clamp(1.125rem, 3.75vw, 1.425rem)",
                                letterSpacing: "-0.03em",
                              }}
                            >
                              <span className="min-w-0 shrink font-medium text-slate-900">{item.orderer || "-"}</span>
                              <span className="shrink-0 text-slate-500">│</span>
                              <span className="min-w-0 shrink font-medium text-slate-900">{item.crop || "-"}</span>
                              <span className="shrink-0 text-slate-500">│</span>
                              <span className="min-w-0 shrink font-medium text-slate-900">{item.seed_owner || "-"}</span>
                              <span className="shrink-0 text-slate-500">│</span>
                              <span className="min-w-0 shrink font-medium text-slate-900">
                                {item.tray_type === "직접입력" ? item.tray_custom || "-" : item.tray_type || "-"}
                              </span>
                              <span className="shrink-0 text-slate-500">│</span>
                              <span className="shrink-0 font-medium text-slate-900">{item.quantity || "-"}</span>
                            </button>
                          ))}
                        </div>
                        {traySummaryEntries.length > 0 && (
                          <div className="shrink-0 border-t-2 border-slate-400 bg-gradient-to-b from-slate-200 to-slate-300 px-2 py-2 text-center font-bold text-slate-800 text-[0.9625rem] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)]">
                            {traySummaryEntries.map(([tray, n]) => `${tray}구 : ${n}개`).join(" │ ")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* 하단: 미처리 주문 (화면 절반) */}
        <section className="flex min-h-0 flex-1 flex-col border-t border-slate-700 bg-slate-950">
          <div className="border-b border-slate-800 px-2 py-2 sm:px-3 sm:py-3">
            <button
              type="button"
              onClick={() => setAddUnprocessedOpen(true)}
              className="w-full rounded-lg bg-slate-700 py-3 text-lg font-bold leading-none text-slate-100 hover:bg-slate-600 sm:rounded-xl sm:py-4 sm:text-[2.25rem]"
              style={{ letterSpacing: "0.15em" }}
            >
              주문 추가
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 sm:p-3">
            {unprocessedLoading ? (
              <div className="py-3 text-center text-xs text-slate-400 sm:py-4 sm:text-sm">로딩 중...</div>
            ) : (
              <>
                <ul className="space-y-1.5 sm:space-y-2">
                  {(() => {
                    const totalPages = Math.min(
                      UNPROCESSED_MAX_PAGES,
                      Math.max(1, Math.ceil(unprocessed.length / UNPROCESSED_PAGE_SIZE)),
                    );
                    const page = Math.max(1, Math.min(unprocessedPage, totalPages));
                    const start = (page - 1) * UNPROCESSED_PAGE_SIZE;
                    const pageList = unprocessed.slice(start, start + UNPROCESSED_PAGE_SIZE);
                    return pageList.map((order) => {
                  const isDeleted = !!order.deleted_at;
                  return (
                    <li key={order.id} className="flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          if (isDeleted) {
                            if (user?.role_level === 0) {
                              setDeletedPostViewOrder(order);
                            } else {
                              showDeletedPostToast(e);
                            }
                          } else {
                            setPostActionOrder(order);
                          }
                        }}
                        onTouchEnd={(e) => {
                          if (isDeleted) {
                            if (user?.role_level === 0) {
                              e.preventDefault();
                              setDeletedPostViewOrder(order);
                            } else {
                              e.preventDefault();
                              showDeletedPostToast(e);
                            }
                          }
                        }}
                        className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-left transition-colors sm:px-4 sm:py-3 ${
                          isDeleted
                            ? "border-slate-700/50 bg-slate-800/40 opacity-75 hover:bg-slate-800/50"
                            : order.reflected_at
                              ? "border-red-900/50 bg-red-950/30 hover:bg-red-950/50"
                              : "border-slate-700 bg-slate-900/80 hover:bg-slate-800"
                        }`}
                      >
                        <div className="flex flex-wrap items-baseline gap-1.5 text-xs sm:gap-2 sm:text-sm">
                          <span
                            className={`min-w-0 flex-1 ${order.reflected_at ? "text-slate-500" : ""} ${isDeleted ? "text-slate-500" : ""}`}
                            style={
                              order.reflected_at && !isDeleted
                                ? { textDecoration: "line-through", textDecorationStyle: "double" }
                                : undefined
                            }
                          >
                            <span className={order.reflected_at || isDeleted ? "text-slate-500" : "text-slate-400"}>
                              {order.created_by_email || "등록자"}
                            </span>
                            <span className={`ml-2 whitespace-pre-wrap break-words ${order.reflected_at || isDeleted ? "text-slate-500" : "text-slate-200"}`}>
                              {isDeleted ? "삭제된 게시글 입니다" : order.content}
                            </span>
                          </span>
                          {order.reflected_at && !isDeleted && (
                            <span className="shrink-0 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                              반영완료
                            </span>
                          )}
                        </div>
                      </button>
                      {isDeleted && user?.role_level === 0 && (
                        <button
                          type="button"
                          onClick={() => setDeletedPostViewOrder(order)}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            setDeletedPostViewOrder(order);
                          }}
                          className="shrink-0 self-center rounded bg-slate-600 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-500 sm:px-3 sm:py-1.5 sm:text-sm"
                        >
                          삭제된 게시글 보기
                        </button>
                      )}
                    </li>
                    );
                  });
                  })()}
                </ul>
                {unprocessed.length > UNPROCESSED_PAGE_SIZE && (
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 border-t border-slate-800 pt-2 sm:mt-3 sm:gap-2 sm:pt-3">
                    <button
                      type="button"
                      disabled={unprocessedPage <= 1}
                      onClick={() => setUnprocessedPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 disabled:opacity-50 hover:bg-slate-700 sm:px-3 sm:py-1.5 sm:text-sm"
                    >
                      이전
                    </button>
                    {Array.from({ length: Math.min(UNPROCESSED_MAX_PAGES, Math.ceil(unprocessed.length / UNPROCESSED_PAGE_SIZE)) }, (_, i) => i + 1).map(
                      (p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setUnprocessedPage(p)}
                          className={`min-w-[1.75rem] rounded-lg px-1.5 py-1 text-xs sm:min-w-[2rem] sm:px-2 sm:py-1.5 sm:text-sm ${
                            p === unprocessedPage
                              ? "bg-amber-600 text-white"
                              : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                          }`}
                        >
                          {p}
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      disabled={
                        unprocessedPage >=
                        Math.min(UNPROCESSED_MAX_PAGES, Math.ceil(unprocessed.length / UNPROCESSED_PAGE_SIZE))
                      }
                      onClick={() =>
                        setUnprocessedPage((p) =>
                          Math.min(
                            UNPROCESSED_MAX_PAGES,
                            Math.ceil(unprocessed.length / UNPROCESSED_PAGE_SIZE),
                            p + 1,
                          ),
                        )
                      }
                      className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 disabled:opacity-50 hover:bg-slate-700 sm:px-3 sm:py-1.5 sm:text-sm"
                    >
                      다음
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      {/* 파종계획 추가 팝업 */}
      <Modal
        open={addPlanOpen !== null}
        title="파종계획 추가"
        onClose={() => {
          setAddPlanOpen(null);
          setAddPlanError(null);
          setAddPlanForm({
            orderer: "",
            crop: "",
            quantity_base: "",
            quantity_extra: "",
            tray_type: "200",
            tray_custom: "",
            seed_owner: "육묘장",
          });
        }}
      >
        <div className="space-y-3">
          {addPlanError && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              {addPlanError}
            </div>
          )}
          <TextField
            label="주문자"
            value={addPlanForm.orderer}
            onChange={(v) => setAddPlanForm((f) => ({ ...f, orderer: v }))}
          />
          <TextField
            label="작물"
            value={addPlanForm.crop}
            onChange={(v) => setAddPlanForm((f) => ({ ...f, crop: v }))}
          />
          <SelectField
            label="종자소유자"
            value={addPlanForm.seed_owner}
            onChange={(v) => setAddPlanForm((f) => ({ ...f, seed_owner: v as SeedOwner }))}
            options={(["육묘장", "주문자"] as SeedOwner[]).map((o) => ({ value: o, label: o }))}
          />
          <SelectField
            label="트레이(구)"
            value={addPlanForm.tray_type}
            onChange={(v) => setAddPlanForm((f) => ({ ...f, tray_type: v }))}
            options={TRAY_OPTIONS.map((t) => ({ value: t, label: t }))}
          />
          {addPlanForm.tray_type === "직접입력" && (
            <TextField
              label="트레이 직접입력"
              value={addPlanForm.tray_custom}
              onChange={(v) => setAddPlanForm((f) => ({ ...f, tray_custom: v }))}
            />
          )}
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <TextField
                label="기본판 수량"
                value={addPlanForm.quantity_base}
                onChange={(v) => setAddPlanForm((f) => ({ ...f, quantity_base: v }))}
              />
            </div>
            <div className="min-w-0 flex-1">
              <TextField
                label="추가판 수량"
                value={addPlanForm.quantity_extra}
                onChange={(v) => setAddPlanForm((f) => ({ ...f, quantity_extra: v }))}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <PrimaryButton
              onClick={() => void handleAddPlanSubmit()}
              disabled={addPlanBusy}
            >
              등록
            </PrimaryButton>
            <SecondaryButton onClick={() => setAddPlanOpen(null)}>
              취소
            </SecondaryButton>
          </div>
        </div>
      </Modal>

      {/* 주문 추가 팝업 */}
      <Modal
        open={addUnprocessedOpen}
        title="주문 추가"
        onClose={() => {
          setAddUnprocessedOpen(false);
          setAddUnprocessedText("");
          setAddUnprocessedError(null);
        }}
      >
        <div className="space-y-3">
          {addUnprocessedError && (
            <div className="rounded-lg bg-red-950/50 border border-red-800 px-3 py-2 text-sm text-red-200">
              {addUnprocessedError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm text-slate-300">내용</label>
            <textarea
              value={addUnprocessedText}
              onChange={(e) => setAddUnprocessedText(e.target.value)}
              placeholder="전화/문자/구두 주문 내용을 입력하세요. 붙여넣기 가능합니다."
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 placeholder-slate-500 min-h-[120px]"
              rows={4}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <PrimaryButton
              onClick={() => void handleAddUnprocessedSubmit()}
              disabled={addUnprocessedBusy || !addUnprocessedText.trim()}
            >
              등록
            </PrimaryButton>
            <SecondaryButton onClick={() => setAddUnprocessedOpen(false)}>
              취소
            </SecondaryButton>
          </div>
        </div>
      </Modal>

      {/* 게시글 액션 (수정/삭제/반영) */}
      <Modal
        open={postActionOrder !== null && editOrder === null && deleteOrder === null}
        title="게시글"
        onClose={() => setPostActionOrder(null)}
      >
        {postActionOrder && user && (
          <div className="flex flex-col gap-2">
            {canEditDeleteUnprocessedOrder(user, postActionOrder) && (
              <>
                <PrimaryButton
                  onClick={() => {
                    setEditOrder(postActionOrder);
                    setEditOrderContent(postActionOrder.content);
                    setPostActionOrder(null);
                  }}
                >
                  수정
                </PrimaryButton>
                <SecondaryButton
                  onClick={() => {
                    setDeleteOrder(postActionOrder);
                    setPostActionOrder(null);
                  }}
                >
                  삭제
                </SecondaryButton>
              </>
            )}
            {canReflectToPlan(user) && !postActionOrder.deleted_at && (
              <>
                {!postActionOrder.reflected_at && (
                  <PrimaryButton
                    onClick={() => {
                      setReflectOrder(postActionOrder);
                      setPostActionOrder(null);
                    }}
                  >
                    파종계획 반영
                  </PrimaryButton>
                )}
                {postActionOrder.reflected_at && (
                  <SecondaryButton
                    onClick={() => {
                      setUnreflectOrder(postActionOrder);
                      setPostActionOrder(null);
                    }}
                  >
                    반영 취소
                  </SecondaryButton>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 미처리 주문 수정 팝업 */}
      <Modal
        open={editOrder !== null}
        title="게시글 수정"
        onClose={() => {
          setEditOrder(null);
          setEditOrderContent("");
        }}
      >
        {editOrder && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-slate-300">내용</label>
              <textarea
                value={editOrderContent}
                onChange={(e) => setEditOrderContent(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 min-h-[100px]"
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <PrimaryButton onClick={() => void handleEditOrderSubmit()} disabled={editOrderBusy}>
                저장
              </PrimaryButton>
              <SecondaryButton onClick={() => setEditOrder(null)}>취소</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

      {/* 미처리 주문 삭제 확인 */}
      <Modal
        open={deleteOrder !== null}
        title="게시글 삭제"
        onClose={() => setDeleteOrder(null)}
      >
        {deleteOrder && (
          <div className="space-y-3">
            <p className="text-slate-200">이 게시글을 삭제하시겠습니까?</p>
            <div className="flex gap-2">
              <PrimaryButton onClick={() => void handleDeleteOrderConfirm()} disabled={deleteOrderBusy}>
                삭제
              </PrimaryButton>
              <SecondaryButton onClick={() => setDeleteOrder(null)}>취소</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

      {/* 삭제된 게시글 보기 (Lv0 전용, 복구 불가) */}
      <Modal
        open={deletedPostViewOrder !== null}
        title="삭제된 게시글 보기"
        onClose={() => setDeletedPostViewOrder(null)}
      >
        {deletedPostViewOrder && (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap break-words rounded bg-slate-800/80 p-3 text-sm text-slate-200">
              {deletedPostViewOrder.content || "(내용 없음)"}
            </p>
            <p className="border-t border-slate-700 pt-2 text-xs text-slate-400">
              삭제를 복구할 수 없으며, 삭제 시점부터 24시간이 지나면 자동으로 완전 삭제됩니다.
            </p>
            <div className="flex justify-end">
              <SecondaryButton onClick={() => setDeletedPostViewOrder(null)}>닫기</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

      {/* 파종계획 반영 확인 팝업 */}
      <Modal
        open={reflectOrder !== null && !reflectDateOpen}
        title="파종계획 반영"
        onClose={() => setReflectOrder(null)}
      >
        <p className="text-slate-200">파종계획에 반영 하시겠습니까?</p>
        <div className="mt-4 flex gap-2">
          <PrimaryButton onClick={handleReflectConfirm}>확인</PrimaryButton>
          <SecondaryButton onClick={() => setReflectOrder(null)}>취소</SecondaryButton>
        </div>
      </Modal>

      {/* 반영 취소 팝업 */}
      <Modal
        open={unreflectOrder !== null}
        title="반영 취소"
        onClose={() => setUnreflectOrder(null)}
      >
        <p className="text-slate-200">
          이 게시글의 파종계획 반영을 취소하시겠습니까? 파종계획에서도 해당 항목이 제거됩니다.
        </p>
        <div className="mt-4 flex gap-2">
          <PrimaryButton onClick={() => void handleUnreflectSubmit()} disabled={unreflectBusy}>
            반영 취소
          </PrimaryButton>
          <SecondaryButton onClick={() => setUnreflectOrder(null)}>닫기</SecondaryButton>
        </div>
      </Modal>

      {/* 파종계획 수정/삭제 팝업 */}
      <Modal
        open={planItemPopup !== null}
        title={planItemPopup ? `${planDateHeader(planItemPopup.plan_date)} 파종계획` : ""}
        onClose={() => {
          setPlanItemPopup(null);
          setPlanItemSaveError(null);
        }}
      >
        {planItemPopup && (
          <div className="space-y-3">
            {planItemSaveError && (
              <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
                {planItemSaveError}
              </div>
            )}
            <TextField
              label="주문자"
              value={planItemEditForm.orderer}
              onChange={(v) => setPlanItemEditForm((f) => ({ ...f, orderer: v }))}
            />
            <TextField
              label="작물"
              value={planItemEditForm.crop}
              onChange={(v) => setPlanItemEditForm((f) => ({ ...f, crop: v }))}
            />
            <SelectField
              label="종자소유자"
              value={planItemEditForm.seed_owner}
              onChange={(v) => setPlanItemEditForm((f) => ({ ...f, seed_owner: v as SeedOwner }))}
              options={(["육묘장", "주문자"] as SeedOwner[]).map((o) => ({ value: o, label: o }))}
            />
            <SelectField
              label="트레이(구)"
              value={planItemEditForm.tray_type}
              onChange={(v) => setPlanItemEditForm((f) => ({ ...f, tray_type: v }))}
              options={TRAY_OPTIONS.map((t) => ({ value: t, label: t }))}
            />
            {planItemEditForm.tray_type === "직접입력" && (
              <TextField
                label="트레이 직접입력"
                value={planItemEditForm.tray_custom}
                onChange={(v) => setPlanItemEditForm((f) => ({ ...f, tray_custom: v }))}
              />
            )}
            <div className="flex gap-3">
              <div className="min-w-0 flex-1">
                <TextField
                  label="기본판 수량"
                  value={planItemEditForm.quantity_base}
                  onChange={(v) => setPlanItemEditForm((f) => ({ ...f, quantity_base: v }))}
                />
              </div>
              <div className="min-w-0 flex-1">
                <TextField
                  label="추가판 수량"
                  value={planItemEditForm.quantity_extra}
                  onChange={(v) => setPlanItemEditForm((f) => ({ ...f, quantity_extra: v }))}
                />
              </div>
            </div>
            {planItemPopup.source_unprocessed_id && (
              <p className="text-xs text-amber-400">
                미처리 주문에서 반영된 항목입니다. 삭제 시 해당 게시글은 반영 전 상태로 돌아갑니다.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <PrimaryButton onClick={() => void handlePlanItemSave()} disabled={planItemSaveBusy}>
                수정
              </PrimaryButton>
              <SecondaryButton
                onClick={() => void handlePlanItemDelete()}
                disabled={planItemDeleteBusy}
              >
                삭제
              </SecondaryButton>
              <SecondaryButton onClick={() => setPlanItemPopup(null)}>닫기</SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

      {/* 파종계획 반영 팝업 (일자·주문자·작물·수량·트레이·종자소유자 입력) */}
      <Modal
        open={reflectDateOpen}
        title="파종계획 반영"
        onClose={() => {
          setReflectDateOpen(false);
          setReflectOrder(null);
          setReflectForm({
            orderer: "",
            crop: "",
            quantity_base: "",
            quantity_extra: "",
            tray_type: "200",
            tray_custom: "",
            seed_owner: "육묘장",
          });
        }}
      >
        <div className="space-y-3">
          {reflectOrder && (
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200">
              <div className="mb-1 text-xs text-slate-400">게시글 내용</div>
              <div className="whitespace-pre-wrap break-words">{reflectOrder.content}</div>
            </div>
          )}
          <DateWheel
            label="일자 선택"
            value={reflectDate}
            onChange={setReflectDate}
          />
          <TextField
            label="주문자"
            value={reflectForm.orderer}
            onChange={(v) => setReflectForm((f) => ({ ...f, orderer: v }))}
          />
          <TextField
            label="작물명"
            value={reflectForm.crop}
            onChange={(v) => setReflectForm((f) => ({ ...f, crop: v }))}
          />
          <SelectField
            label="종자소유자"
            value={reflectForm.seed_owner}
            onChange={(v) => setReflectForm((f) => ({ ...f, seed_owner: v as SeedOwner }))}
            options={(["육묘장", "주문자"] as SeedOwner[]).map((o) => ({ value: o, label: o }))}
          />
          <SelectField
            label="트레이(구)"
            value={reflectForm.tray_type}
            onChange={(v) => setReflectForm((f) => ({ ...f, tray_type: v }))}
            options={TRAY_OPTIONS.map((t) => ({ value: t, label: t }))}
          />
          {reflectForm.tray_type === "직접입력" && (
            <TextField
              label="트레이 직접입력"
              value={reflectForm.tray_custom}
              onChange={(v) => setReflectForm((f) => ({ ...f, tray_custom: v }))}
            />
          )}
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <TextField
                label="기본판 수량"
                value={reflectForm.quantity_base}
                onChange={(v) => setReflectForm((f) => ({ ...f, quantity_base: v }))}
              />
            </div>
            <div className="min-w-0 flex-1">
              <TextField
                label="추가판 수량"
                value={reflectForm.quantity_extra}
                onChange={(v) => setReflectForm((f) => ({ ...f, quantity_extra: v }))}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <PrimaryButton
              onClick={() => void handleReflectDateSubmit()}
              disabled={reflectBusy}
            >
              등록
            </PrimaryButton>
            <SecondaryButton
              onClick={() => {
                setReflectDateOpen(false);
                setReflectOrder(null);
                setReflectForm({
                  orderer: "",
                  crop: "",
                  quantity_base: "",
                  quantity_extra: "",
                  tray_type: "200",
                  tray_custom: "",
                  seed_owner: "육묘장",
                });
              }}
            >
              취소
            </SecondaryButton>
          </div>
        </div>
      </Modal>

      {/* 전체일정 캘린더 */}
      {calendarOpen && (
        <div className="modal-safe-area fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <button
            type="button"
            onClick={() => setCalendarOpen(false)}
            className="absolute inset-0"
            aria-label="닫기"
          />
          <div
            className="relative max-h-[90vh] w-full max-w-md overflow-auto rounded-xl border border-slate-700 bg-slate-950 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 sm:px-4 sm:py-3">
              <button
                type="button"
                onClick={() => {
                  if (calendarMonth === 1) {
                    setCalendarYear((y) => y - 1);
                    setCalendarMonth(12);
                  } else setCalendarMonth((m) => m - 1);
                }}
                className="rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-800 sm:px-3 sm:py-2"
              >
                ‹
              </button>
              <div className="text-base font-semibold text-slate-100 sm:text-lg">
                {calendarYear}년 {PLAN_MONTH_KO[calendarMonth - 1]}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (calendarMonth === 12) {
                    setCalendarYear((y) => y + 1);
                    setCalendarMonth(1);
                  } else setCalendarMonth((m) => m + 1);
                }}
                className="rounded-lg px-2 py-1.5 text-slate-300 hover:bg-slate-800 sm:px-3 sm:py-2"
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 p-2 sm:gap-1 sm:p-4">
              {PLAN_WEEKDAY_KO.map((w) => (
                <div
                  key={w}
                  className="flex h-7 items-center justify-center text-xs font-medium text-slate-400 sm:h-9 sm:text-sm"
                >
                  {w}
                </div>
              ))}
              {calendarDays.map((d, i) =>
                d === null ? (
                  <div key={`e-${i}`} className="h-12" />
                ) : (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                      setFocusDate(clampPlanDate(dateStr));
                      setCalendarOpen(false);
                    }}
                    className="flex h-9 w-full flex-col items-center justify-center rounded-lg text-xs text-slate-200 hover:bg-slate-800 sm:h-12 sm:rounded-xl sm:text-sm"
                  >
                    <span>{d}</span>
                    {planCounts[
                      `${calendarYear}-${String(calendarMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`
                    ] != null && (
                      <span className="text-xs text-amber-400">
                        {planCounts[
                          `${calendarYear}-${String(calendarMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`
                        ]}
                        건
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
            <div className="border-t border-slate-800 p-3">
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="w-full rounded-lg bg-slate-800 py-2 text-slate-200 hover:bg-slate-700"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CertificatePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = React.useState(() => new Date());
  const [roleInfoOpen, setRoleInfoOpen] = React.useState(false);
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!user) return <Navigate to="/" replace />;
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-0">
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold tracking-tight sm:text-2xl">충주 친환경 육묘장</div>
            <div className="text-xs text-slate-400 sm:text-sm">육묘확인서 발급</div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2.5 text-right text-[0.825rem] sm:gap-3 sm:text-[1.1rem]">
            <button
              type="button"
              onClick={() => setRoleInfoOpen(true)}
              className="rounded-full bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              {ROLE_LABEL[user.role_level]}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              로그아웃
            </button>
            <span className="hidden text-slate-400 sm:inline">{formatDateTimeKO(now)}</span>
            <button
              type="button"
              onClick={() => navigate("/menu")}
              className="rounded-lg bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              메인메뉴
            </button>
          </div>
        </div>
      </header>
      <Modal open={roleInfoOpen} title="권한 등급 안내" onClose={() => setRoleInfoOpen(false)}>
        <div className="space-y-2 text-sm text-slate-200">
          {ROLE_LEVELS.map((level) => (
            <div key={level}>
              {ROLE_LABEL[level]}
              {level === user.role_level && (
                <span className="ml-1 text-amber-400">* 현재 나의 등급입니다.</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-slate-700 pt-3 text-xs text-slate-400">
          권한에 관한 문의는 최고관리자에게 문의바랍니다 (정효조 / 010-2604-6588)
        </p>
      </Modal>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <div className="text-sm text-slate-400">
          추후 파종·출하 데이터를 기반으로 육묘확인서 PDF/출력 기능을 연결할 예정입니다.
        </div>
        <Link
          to="/menu"
          className="mt-4 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800"
        >
          메인메뉴로 돌아가기
        </Link>
      </main>
    </div>
  );
}

function AdminPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = React.useState(() => new Date());
  const [roleInfoOpen, setRoleInfoOpen] = React.useState(false);
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!user) return <Navigate to="/" replace />;
  if (user.role_level !== 0) return <Navigate to="/menu" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-0">
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold tracking-tight sm:text-2xl">충주 친환경 육묘장</div>
            <div className="text-xs text-slate-400 sm:text-sm">관리자 메뉴</div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2.5 text-right text-[0.825rem] sm:gap-3 sm:text-[1.1rem]">
            <button
              type="button"
              onClick={() => setRoleInfoOpen(true)}
              className="rounded-full bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              {ROLE_LABEL[user.role_level]}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              로그아웃
            </button>
            <span className="hidden text-slate-400 sm:inline">{formatDateTimeKO(now)}</span>
            <button
              type="button"
              onClick={() => navigate("/menu")}
              className="rounded-lg bg-slate-800 px-2.5 py-2 text-slate-200 hover:bg-slate-700 sm:px-3.5 sm:py-2.5"
            >
              메인메뉴
            </button>
          </div>
        </div>
      </header>
      <Modal open={roleInfoOpen} title="권한 등급 안내" onClose={() => setRoleInfoOpen(false)}>
        <div className="space-y-2 text-sm text-slate-200">
          {ROLE_LEVELS.map((level) => (
            <div key={level}>
              {ROLE_LABEL[level]}
              {level === user.role_level && (
                <span className="ml-1 text-amber-400">* 현재 나의 등급입니다.</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-slate-700 pt-3 text-xs text-slate-400">
          권한에 관한 문의는 최고관리자에게 문의바랍니다 (정효조 / 010-2604-6588)
        </p>
      </Modal>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <div className="flex flex-col gap-3">
          <Link
            to="/admin/approvals"
            className="rounded-xl border border-slate-700 bg-slate-900 px-6 py-4 text-center text-slate-100 hover:bg-slate-800"
          >
            가입승인
          </Link>
          <Link
            to="/admin/staff"
            className="rounded-xl border border-slate-700 bg-slate-900 px-6 py-4 text-center text-slate-100 hover:bg-slate-800"
          >
            직원관리
          </Link>
        </div>
      </main>
    </div>
  );
}

function AdminApprovalsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = React.useState<Awaited<ReturnType<typeof fetchPendingApprovalUsers>>>([]);
  const [loading, setLoading] = React.useState(true);
  const [approvingId, setApprovingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [roleByUserId, setRoleByUserId] = React.useState<Record<string, number>>({});

  const load = React.useCallback(async () => {
    if (!isSupabaseConfigured) {
      setPending([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchPendingApprovalUsers();
      setPending(list);
      setRoleByUserId((prev) => {
        const next = { ...prev };
        list.forEach((u) => {
          if (next[u.id] === undefined) next[u.id] = 3;
        });
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러올 수 없습니다.");
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async (userId: string) => {
    const roleLevel = roleByUserId[userId] ?? 3;
    setError(null);
    setApprovingId(userId);
    try {
      await approveUser(userId, roleLevel);
      setPending((prev) => prev.filter((u) => u.id !== userId));
      setRoleByUserId((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "승인 처리에 실패했습니다.");
    } finally {
      setApprovingId(null);
    }
  };

  if (!user) return <Navigate to="/" replace />;
  if (user.role_level !== 0) return <Navigate to="/menu" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-0">
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold tracking-tight sm:text-2xl">충주 친환경 육묘장</div>
            <div className="text-xs text-slate-400 sm:text-sm">가입승인</div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="flex-shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 sm:px-3 sm:py-1.5 sm:text-base"
          >
            관리자 메뉴
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto px-4 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-center text-slate-400">로딩 중...</p>
        ) : pending.length === 0 ? (
          <p className="text-center text-slate-400">승인 대기 중인 가입 요청이 없습니다.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-500">
              각 사용자에 대해 부여할 등급을 선택한 뒤 승인하세요. Lv1으로 승인된 사용자는 다음 로그인 시 푸시 알림 허용 안내를 받습니다.
            </p>
            <ul className="space-y-3">
            {pending.map((u) => (
              <li
                key={u.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 shrink-0">
                  <div className="truncate font-medium text-slate-200" title={u.email || u.name || ""}>
                    {u.email || u.name || "(이메일/이름 없음)"}
                  </div>
                  {u.email && u.name && (
                    <div className="mt-0.5 truncate text-xs text-slate-500" title={`${u.email} · ${u.name}`}>
                      {u.email} · {u.name}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-700 pt-3 sm:border-t-0 sm:pt-0">
                  <span className="text-xs text-slate-500">등급:</span>
                  <select
                    value={roleByUserId[u.id] ?? 3}
                    onChange={(e) =>
                      setRoleByUserId((prev) => ({ ...prev, [u.id]: Number(e.target.value) }))
                    }
                    disabled={approvingId !== null}
                    className="min-w-[10rem] rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
                  >
                    {ROLE_LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        {ROLE_LABEL[lv]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={approvingId !== null}
                    onClick={() => void handleApprove(u.id)}
                    className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {approvingId === u.id ? "처리 중..." : "승인"}
                  </button>
                </div>
              </li>
            ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

function AdminStaffPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = React.useState<Awaited<ReturnType<typeof fetchApprovedUsers>>>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [roleByUserId, setRoleByUserId] = React.useState<Record<string, number>>({});

  const load = React.useCallback(async () => {
    if (!isSupabaseConfigured) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApprovedUsers();
      setList(data);
      setRoleByUserId((prev) => {
        const next = { ...prev };
        data.forEach((u) => {
          next[u.id] = u.role_level;
        });
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러올 수 없습니다.");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSaveRole = async (userId: string) => {
    const newLevel = roleByUserId[userId];
    if (newLevel === undefined) return;
    setError(null);
    setSavingId(userId);
    try {
      await approveUser(userId, newLevel);
      setList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role_level: newLevel } : u))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "등급 변경에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  if (!user) return <Navigate to="/" replace />;
  if (user.role_level !== 0) return <Navigate to="/menu" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-3 py-2 backdrop-blur sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-0">
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold tracking-tight sm:text-2xl">충주 친환경 육묘장</div>
            <div className="text-xs text-slate-400 sm:text-sm">직원관리</div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="flex-shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 sm:px-3 sm:py-1.5 sm:text-base"
          >
            관리자 메뉴
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto px-4 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-center text-slate-400">로딩 중...</p>
        ) : list.filter((u) => u.id !== user.id).length === 0 ? (
          <p className="text-center text-slate-400">승인된 직원이 없습니다. (본인 제외)</p>
        ) : (
          <ul className="space-y-3">
            {list.filter((u) => u.id !== user.id).map((u) => (
              <li
                key={u.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 shrink-0">
                  <div className="truncate font-medium text-slate-200" title={u.email || u.name || ""}>
                    {u.email || u.name || "(이메일/이름 없음)"}
                  </div>
                  {u.email && u.name && (
                    <div className="mt-0.5 truncate text-xs text-slate-500" title={`${u.email} · ${u.name}`}>
                      {u.email} · {u.name}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-700 pt-3 sm:border-t-0 sm:pt-0">
                  <span className="text-xs text-slate-500">현재 등급:</span>
                  <span className="text-sm text-slate-300">{ROLE_LABEL[u.role_level]}</span>
                  <span className="text-xs text-slate-500">변경:</span>
                  <select
                    value={roleByUserId[u.id] ?? u.role_level}
                    onChange={(e) =>
                      setRoleByUserId((prev) => ({ ...prev, [u.id]: Number(e.target.value) }))
                    }
                    disabled={savingId !== null}
                    className="min-w-[10rem] rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
                  >
                    {ROLE_LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        {ROLE_LABEL[lv]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={savingId !== null || (roleByUserId[u.id] ?? u.role_level) === u.role_level}
                    onClick={() => void handleSaveRole(u.id)}
                    className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {savingId === u.id ? "저장 중..." : "저장"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/menu" element={<MainMenuPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/planning" element={<PlanningPage />} />
      <Route path="/certificate" element={<CertificatePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/approvals" element={<AdminApprovalsPage />} />
      <Route path="/admin/staff" element={<AdminStaffPage />} />
      <Route path="*" element={<Navigate to="/menu" replace />} />
    </Routes>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <SupabaseSetupPage />;
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

