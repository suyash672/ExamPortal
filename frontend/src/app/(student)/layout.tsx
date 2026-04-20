"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageLoader } from "@/components/ui/PageLoader";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";

export default function StudentLayout({ children }: { children: ReactNode }) {
  const { user, loading, isStudent, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !isStudent) {
      router.replace("/login");
    }
  }, [isStudent, loading, router]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-slate-50 text-slate-600">
        <Spinner />
        Loading student portal...
      </div>
    );
  }

  if (!isStudent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Redirecting to login...
      </div>
    );
  }

  const isAttemptPage = pathname.startsWith("/tests/");

  if (isAttemptPage) {
    return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
              ExamShield
            </p>
            <p className="mt-1 text-sm text-slate-600">Student Portal</p>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-slate-900">{user?.name ?? "Student"}</p>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
      </main>
    </div>
  );
}
