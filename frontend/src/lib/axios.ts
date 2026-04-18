import axios from "axios";

let accessToken: string | null = null;

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
  (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined") {
      setAccessToken(null);

      const pathname = window.location.pathname;
      const isAuthPage = pathname === "/login" || pathname === "/register";
      const requestUrl = String(error?.config?.url ?? "");
      const isRefreshRequest = requestUrl.includes("/api/auth/refresh");

      if (!isAuthPage && !isRefreshRequest) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;
