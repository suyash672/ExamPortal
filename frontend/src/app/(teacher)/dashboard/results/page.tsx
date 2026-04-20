"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getTests, type TestListItem } from "@/lib/api/tests";

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

export default function TeacherResultsPage() {
  const [tests, setTests] = useState<TestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTests = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getTests();
      setTests(data);
    } catch {
      setError("Unable to load results. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTests();
  }, [loadTests]);

  const resultTests = useMemo(
    () => tests.filter((test) => test.isLocked || test.enrollmentCount > 0),
    [tests]
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Results</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Test results</h1>
        <p className="mt-2 text-sm text-slate-500">
          Open any completed or enrolled test to review submissions and detailed attempt data.
        </p>
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
      ) : resultTests.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No results yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Results will appear here once students enroll and submit attempts.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Start</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">End</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Enrollments</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resultTests.map((test) => (
                <tr key={test.id} className="transition hover:bg-slate-50/60">
                  <td className="px-4 py-4 text-sm font-medium text-slate-900">{test.title}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{formatDateTime(test.startTime)}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{formatDateTime(test.endTime)}</td>
                  <td className="px-4 py-4 text-sm text-slate-700">{test.enrollmentCount}</td>
                  <td className="px-4 py-4 text-sm">
                    <Link
                      href={`/dashboard/tests/${test.id}/results`}
                      className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      Open Results
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
