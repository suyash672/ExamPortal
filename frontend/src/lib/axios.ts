import axios from "axios";

type RefreshResult =
  | { status: "ok"; token: string }
  | { status: "auth-failed" }
  | { status: "transient" };

let accessToken: string | null = null;
let refreshPromise: Promise<RefreshResult> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const nextConfig = { ...config };

  if (accessToken) {
    nextConfig.headers = nextConfig.headers ?? {};
    nextConfig.headers.Authorization = `Bearer ${accessToken}`;
  }

  return nextConfig;
});

async function requestRefresh(): Promise<RefreshResult> {
  try {
    const response = await axios.post(
      `${api.defaults.baseURL}/api/auth/refresh`,
      {},
      { withCredentials: true }
    );

    const newToken = response?.data?.accessToken;

    if (typeof newToken === "string" && newToken) {
      setAccessToken(newToken);
      return { status: "ok", token: newToken };
    }

    setAccessToken(null);
    return { status: "auth-failed" };
  } catch (refreshError: any) {
    // Only treat a 401 as a real "session is dead" signal. Network errors,
    // timeouts, and 5xx are transient and must NOT force a logout.
    if (refreshError?.response?.status === 401) {
      setAccessToken(null);
      return { status: "auth-failed" };
    }

    return { status: "transient" };
  }
}

function redirectToLogin(): void {
  if (typeof window === "undefined") {
    return;
  }

  const pathname = window.location.pathname;
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (!isAuthPage) {
    window.location.href = "/login";
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalConfig = error?.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const requestUrl = String(originalConfig?.url ?? "");
    const isRefreshRequest = requestUrl.includes("/api/auth/refresh");
    const isAuthRequest =
      requestUrl.includes("/api/auth/login") || requestUrl.includes("/api/auth/register");

    if (status !== 401 || !originalConfig || originalConfig._retry || isRefreshRequest || isAuthRequest) {
      return Promise.reject(error);
    }

    originalConfig._retry = true;

    if (!refreshPromise) {
      refreshPromise = requestRefresh().finally(() => {
        refreshPromise = null;
      });
    }

    const result = await refreshPromise;

    if (result.status === "ok") {
      originalConfig.headers = originalConfig.headers ?? {};
      originalConfig.headers.Authorization = `Bearer ${result.token}`;
      return api(originalConfig);
    }

    // Transient refresh failure: keep the session and surface the error so the
    // caller can retry, instead of bouncing the user to the login screen.
    if (result.status === "transient") {
      return Promise.reject(error);
    }

    // auth-failed: the refresh token is genuinely invalid/expired.
    redirectToLogin();
    return Promise.reject(error);
  }
);

export default api;
