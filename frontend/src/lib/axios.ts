import axios from "axios";

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

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

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalConfig = error?.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const requestUrl = String(originalConfig?.url ?? "");
    const isRefreshRequest = requestUrl.includes("/api/auth/refresh");
    const isAuthRequest =
      requestUrl.includes("/api/auth/login") || requestUrl.includes("/api/auth/register");

    if (status === 401 && originalConfig && !originalConfig._retry && !isRefreshRequest && !isAuthRequest) {
      originalConfig._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(
              `${api.defaults.baseURL}/api/auth/refresh`,
              {},
              { withCredentials: true }
            )
            .then((response) => {
              const newToken = response?.data?.accessToken;

              if (typeof newToken === "string" && newToken) {
                setAccessToken(newToken);
                return newToken;
              }

              setAccessToken(null);
              return null;
            })
            .catch(() => {
              setAccessToken(null);
              return null;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        const refreshedToken = await refreshPromise;

        if (refreshedToken) {
          originalConfig.headers = originalConfig.headers ?? {};
          originalConfig.headers.Authorization = `Bearer ${refreshedToken}`;
          return api(originalConfig);
        }
      } catch {
        setAccessToken(null);
      }
    }

    if (status === 401 && typeof window !== "undefined") {
      const pathname = window.location.pathname;
      const isAuthPage = pathname === "/login" || pathname === "/register";

      if (!isAuthPage && !isRefreshRequest) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;
