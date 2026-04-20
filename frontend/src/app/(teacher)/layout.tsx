"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageLoader } from "@/components/ui/PageLoader";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";

const navigationItems = [
  { label: "Subjects", href: "/dashboard/subjects" },
  { label: "Tests", href: "/dashboard/tests" },
  { label: "Results", href: "/dashboard/results" }
];

export default function TeacherLayout({ children }: { children: ReactNode }) {
  const { user, loading, isTeacher, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isTeacher) {
      router.replace("/login");
    }
  }, [isTeacher, loading, router]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-slate-50 text-slate-600">
        <Spinner />
        Loading dashboard...
      </div>
    );
  }

  if (!isTeacher) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Redirecting to login...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      {mobileNavOpen ? (
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          aria-label="Close navigation"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white px-5 py-6 transition-transform lg:static lg:translate-x-0 lg:px-6 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
            ExamShield
          </p>
          <h1 className="mt-2 text-xl font-semibold">Teacher Portal</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your content and exams.</p>
        </div>

        <nav className="space-y-2">
          {navigationItems.map((item) => {
            const active = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition ${
                  active
                    ? "bg-teal-50 text-teal-900 ring-1 ring-inset ring-teal-100"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span>{item.label}</span>
                <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-teal-600" : "bg-slate-300"}`} />
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileNavOpen((current) => !current)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-700 transition hover:bg-slate-100 lg:hidden"
                aria-label="Toggle navigation"
              >
                ☰
              </button>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Signed in as teacher
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">{user?.name ?? "Teacher"}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Suspense fallback={<PageLoader />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
