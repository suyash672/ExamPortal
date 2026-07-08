"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { getApiErrorMessage } from "@/lib/apiError";
import { deleteTest, getTests, type TestListItem, type TestStatus } from "@/lib/api/tests";

function formatDateTime(value: string): string {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getStatus(test: TestListItem): TestStatus {
  const now = Date.now();
  const start = new Date(test.startTime).getTime();
  const end = new Date(test.endTime).getTime();

  if (now < start) {
    return "Upcoming";
  }

  if (now >= start && now <= end) {
    return "Active";
  }

  return "Ended";
}

function StatusBadge({ status }: { status: TestStatus }) {
  const className =
    status === "Upcoming"
      ? "border-sky-200 bg-sky-50 text-sky-900"
      : status === "Active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      {status}
    </span>
  );
}

export default function TeacherTestsPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tests, setTests] = useState<TestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TestListItem | null>(null);
  const [createDropdownOpen, setCreateDropdownOpen] = useState(false);

  const loadTests = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getTests();
      setTests(data);
    } catch {
      setError("Unable to load tests. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTests();
  }, [loadTests]);

  useEffect(() => {
    if (searchParams.get("created") !== "1") {
      return;
    }

    showToast("Test created successfully");
    router.replace("/dashboard/tests");
  }, [router, searchParams, showToast]);

  const rows = useMemo(
    () => tests.map((test) => ({ ...test, status: getStatus(test) })),
    [tests]
  );

  const handleDelete = async () => {
    if (!pendingDelete || pendingDelete.isLocked) {
      return;
    }

    try {
      setDeletingId(pendingDelete.id);
      await deleteTest(pendingDelete.id);
      showToast("Test deleted");
      setPendingDelete(null);
      await loadTests();
    } catch (apiError: any) {
      showToast(getApiErrorMessage(apiError, "Failed to delete test"), "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Tests</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Manage tests</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Create tests, review schedules, and manage enrollments.
          </p>
        </div>

        <div className="relative inline-block text-left">
          <button
            type="button"
            onClick={() => setCreateDropdownOpen((prev) => !prev)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] shadow-sm focus:outline-none"
          >
            <span>Create Test</span>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {createDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCreateDropdownOpen(false)} />
              <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5 z-20 focus:outline-none">
                <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Select Test Type</p>
                <div className="grid gap-1">
                  <Link
                    href="/dashboard/tests/new?type=QUIZ"
                    onClick={() => setCreateDropdownOpen(false)}
                    className="flex flex-col rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 transition"
                  >
                    <span className="text-sm font-semibold text-slate-900">Quiz</span>
                    <span className="text-xs text-slate-500 mt-0.5">Single-module practice. Answers revealed, results not stored for teacher.</span>
                  </Link>
                  <Link
                    href="/dashboard/tests/new?type=TEST"
                    onClick={() => setCreateDropdownOpen(false)}
                    className="flex flex-col rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 transition"
                  >
                    <span className="text-sm font-semibold text-slate-900">Test</span>
                    <span className="text-xs text-slate-500 mt-0.5">Standard assessment. Multi-module, results stored in dashboard.</span>
                  </Link>
                  <Link
                    href="/dashboard/tests/new?type=EXAM"
                    onClick={() => setCreateDropdownOpen(false)}
                    className="flex flex-col rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 transition"
                  >
                    <span className="text-sm font-semibold text-slate-900">Exam</span>
                    <span className="text-xs text-slate-500 mt-0.5">Formal examination. Whole subject curriculum, high monitoring.</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-6 w-44 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            📝
          </div>
          <h2 className="text-lg font-semibold text-slate-900">No tests yet</h2>
          <p className="mt-2 text-sm text-slate-500">Create your first test to start scheduling assessments.</p>
          <Link
            href="/dashboard/tests/new"
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
          >
            Create Test
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Start</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">End</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Marks</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Enrollments</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Lock</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((test) => (
                <tr key={test.id} className="transition hover:bg-slate-50/60">
                  <td className="px-4 py-4 text-sm font-medium text-slate-900">{test.title}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{formatDateTime(test.startTime)}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{formatDateTime(test.endTime)}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{test.durationMinutes} min</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{test.totalMarks}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{test.enrollmentCount}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">
                    <StatusBadge status={test.status} />
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-700">
                    {test.isLocked ? (
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                        Locked
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                        Unlocked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {test.isLocked ? (
                          <Link
                            href={`/dashboard/tests/${test.id}/results`}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                          >
                            Results
                          </Link>
                        ) : null}

                        <Link
                          href={`/tests/preview-${test.id}`}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200"
                        >
                          Preview
                        </Link>

                        <button
                          type="button"
                          onClick={() => setPendingDelete(test)}
                          disabled={test.isLocked || deletingId === test.id}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingId === test.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete test"
        message={`Delete test "${pendingDelete?.title ?? ""}"?`}
        loading={Boolean(deletingId)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
