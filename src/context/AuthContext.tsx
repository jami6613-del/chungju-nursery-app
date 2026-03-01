import React from "react";
import type { AppUser } from "../types";
import { fetchCurrentUser, isSupabaseConfigured, supabase } from "../supabaseClient";

const INACTIVITY_DAYS = 7;
const INACTIVITY_MS = INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = "auth_last_activity_at";
const ACTIVITY_THROTTLE_MS = 60 * 1000; // 1분에 한 번만 저장

type AuthState = {
  user: AppUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** 마지막 활동 시각 갱신 (로그인 직후 등) */
  touchActivity: () => void;
};

const AuthContext = React.createContext<AuthState | undefined>(undefined);

function getLastActivity(): number | null {
  try {
    const v = localStorage.getItem(LAST_ACTIVITY_KEY);
    return v ? parseInt(v, 10) : null;
  } catch {
    return null;
  }
}

function setLastActivity(ts: number): void {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(ts));
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const lastWriteRef = React.useRef(0);

  const touchActivity = React.useCallback(() => {
    const now = Date.now();
    if (now - lastWriteRef.current < ACTIVITY_THROTTLE_MS) return;
    lastWriteRef.current = now;
    setLastActivity(now);
  }, []);

  const signOut = React.useCallback(async () => {
    if (!isSupabaseConfigured) return;
    await supabase.auth.signOut();
    setUser(null);
    try {
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch {
      // ignore
    }
  }, []);

  const refresh = React.useCallback(async () => {
    if (!isSupabaseConfigured) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const u = await fetchCurrentUser();
      const now = Date.now();
      const lastAt = getLastActivity();
      if (u) {
        if (lastAt != null && now - lastAt > INACTIVITY_MS) {
          await supabase.auth.signOut();
          setUser(null);
          try {
            localStorage.removeItem(LAST_ACTIVITY_KEY);
          } catch {
            // ignore
          }
          return;
        }
        setLastActivity(now);
        lastWriteRef.current = now;
      }
      setUser(u);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    if (!isSupabaseConfigured) return;
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  React.useEffect(() => {
    if (!user) return;
    const onActivity = () => touchActivity();
    const events = ["click", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
  }, [user, touchActivity]);

  return (
    <AuthContext.Provider value={{ user, isLoading, refresh, signOut, touchActivity }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

