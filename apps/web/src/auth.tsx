import type { HomeState, OnboardingState } from "@adaptive-labs/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { api, ApiError } from "./api";
import { sessionStore } from "./session";

type AuthState =
  | { status: "loading"; error: null; token: null; onboarding: null; home: null }
  | { status: "anonymous"; error: null; token: null; onboarding: null; home: null }
  | { status: "error"; error: string; token: null; onboarding: null; home: null }
  | { status: "authenticated"; error: null; token: string; onboarding: OnboardingState; home: HomeState | null };

type AuthContextValue = AuthState & {
  authenticate: (token: string) => Promise<void>;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  signOut: () => Promise<void>;
};

const initialState: AuthState = { status: "loading", error: null, token: null, onboarding: null, home: null };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>(initialState);

  const load = useCallback(async (token: string) => {
    setState(initialState);
    try {
      const onboarding = await api.onboarding(token);
      const home = onboarding.completed ? await api.home(token) : null;
      sessionStore.set(token);
      setState({ status: "authenticated", error: null, token, onboarding, home });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        sessionStore.clear();
        setState({ status: "anonymous", error: null, token: null, onboarding: null, home: null });
        return;
      }
      setState({ status: "error", error: message(error), token: null, onboarding: null, home: null });
    }
  }, []);

  const retry = useCallback(async () => {
    const token = sessionStore.get();
    if (token) await load(token);
    else setState({ status: "anonymous", error: null, token: null, onboarding: null, home: null });
  }, [load]);

  useEffect(() => { void retry(); }, [retry]);
  useEffect(()=>{const expired=()=>{sessionStore.clear();setState({status:"anonymous",error:null,token:null,onboarding:null,home:null});};window.addEventListener("adaptive:session-expired",expired);return()=>window.removeEventListener("adaptive:session-expired",expired);},[]);

  const signOut = useCallback(async () => {
    const token = sessionStore.get();
    if (token) await api.logout(token).catch(() => undefined);
    sessionStore.clear();
    setState({ status: "anonymous", error: null, token: null, onboarding: null, home: null });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ ...state, authenticate: load, refresh: retry, retry, signOut }), [state, load, retry, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
