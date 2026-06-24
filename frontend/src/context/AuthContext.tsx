"use client";

import type { AxiosError } from "axios";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import api, { setAccessToken } from "../lib/axios";
import type { AuthUser, UserRole } from "../lib/types";

type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

type RefreshResponse = {
  accessToken: string;
  user: AuthUser | null;
};

type JwtPayload = {
  id: string;
  role: UserRole;
};

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  sessionRestoreError: boolean;
  login: (email: string, password: string, role: UserRole) => Promise<AuthUser>;
  logout: () => Promise<void>;
  isTeacher: boolean;
  isStudent: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeTokenPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payloadPart = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const normalized =
      payloadPart + "=".repeat((4 - (payloadPart.length % 4)) % 4);
    const decoded = JSON.parse(atob(normalized)) as Partial<JwtPayload>;

    if (
      typeof decoded.id !== "string" ||
      (decoded.role !== "TEACHER" && decoded.role !== "STUDENT")
    ) {
      return null;
    }

    return { id: decoded.id, role: decoded.role };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessTokenState, setAccessTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionRestoreError, setSessionRestoreError] = useState(false);

  const setSessionToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    setAccessToken(token);
  }, []);

  const restoreSession = useCallback(async () => {
    // Try up to 2 times. A non-401 error (500, network blip) on page load must
    // NOT immediately log the user out — the refresh cookie may still be valid.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await api.post<RefreshResponse>("/api/auth/refresh");
        const refreshedToken = response.data.accessToken;
        setSessionToken(refreshedToken);

        if (response.data.user) {
          setUser(response.data.user);
        } else {
          const decoded = decodeTokenPayload(refreshedToken);
          if (decoded) {
            setUser((previous) => ({
              id: decoded.id,
              role: decoded.role,
              name: previous?.name ?? "",
              email: previous?.email ?? ""
            }));
          }
        }

        setSessionRestoreError(false);
        setLoading(false);
        return;
      } catch (error) {
        const axiosError = error as AxiosError;

        if (axiosError.response?.status === 401) {
          // Refresh token is definitively invalid — log out immediately.
          setUser(null);
          setSessionToken(null);
          setSessionRestoreError(false);
          setLoading(false);
          return;
        }

        // Transient error (500, network). Wait briefly then retry once.
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }

    // Both attempts failed with a transient error. Signal this so the layout
    // does NOT redirect to /login — the cookie may still be valid.
    setSessionToken(null);
    setSessionRestoreError(true);
    setLoading(false);
  }, [setSessionToken]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const login = useCallback(
    async (email: string, password: string, role: UserRole) => {
      const response = await api.post<LoginResponse>("/api/auth/login", {
        email,
        password,
        role
      });

      const { accessToken: issuedToken, user: signedInUser } = response.data;

      setSessionToken(issuedToken);
      setUser(signedInUser);
      setSessionRestoreError(false);

      return signedInUser;
    },
    [setSessionToken]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      setUser(null);
      setSessionToken(null);
    }
  }, [setSessionToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken: accessTokenState,
      loading,
      sessionRestoreError,
      login,
      logout,
      isTeacher: user?.role === "TEACHER",
      isStudent: user?.role === "STUDENT"
    }),
    [accessTokenState, loading, sessionRestoreError, login, logout, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
