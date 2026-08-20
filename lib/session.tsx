"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, isApiError, send, type ApiError } from "./api";
import type { UserDto } from "./types";

type SessionValue = {
  user: UserDto | null;
  loading: boolean;
  error: ApiError | null;
  clearError: () => void;
  login: (email: string, password: string) => Promise<void>;
  refresh: () => Promise<void>;
  becomeCreator: () => Promise<void>;
};

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUser(await api<UserDto>("/api/user/me"));
    } catch (e) {
      // 401 just means "not signed in" — not an error worth showing
      if (isApiError(e) && e.status === 401) setUser(null);
      else if (isApiError(e)) setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Asking the backend who we are is the one thing this provider must do on mount, and
    // refresh only sets state after awaiting the response — the rule cannot see through the
    // async boundary, so it reads the call as a synchronous setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        // the backend sets the httpOnly cookie on this response; we never see the token
        await send<{ token: string }>("POST", "/auth/login", { email, password });
        await refresh();
      } catch (e) {
        if (isApiError(e)) setError(e);
      }
    },
    [refresh],
  );

  const becomeCreator = useCallback(async () => {
    setError(null);
    try {
      await send("POST", "/api/user/become-creator");
      await refresh();
    } catch (e) {
      if (isApiError(e)) setError(e);
    }
  }, [refresh]);

  return (
    <Ctx.Provider
      value={{ user, loading, error, clearError: () => setError(null), login, refresh, becomeCreator }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}
