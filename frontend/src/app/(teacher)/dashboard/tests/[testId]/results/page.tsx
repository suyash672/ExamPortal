"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AttemptDetailDrawer } from "@/components/teacher/AttemptDetailDrawer";
import { useToast } from "@/components/ui/ToastProvider";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  downloadResultsCsv,
  getAttemptDetail,
  getTestResults,
  type AttemptDetail,
  type TestResultItem
} from "@/lib/api/results";
import { getTestById } from "@/lib/api/tests";

type SortField = "score" | "name";

type SortDirection = "asc" | "desc";

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function normalizeTestId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default function TestResultsPage() {
  const params = useParams<{ testId: string }>();
  const testId = normalizeTestId(params?.testId);
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testTitle, setTestTitle] = useState("Test");
  const [totalEnrolled, setTotalEnrolled] = useState(0);
  const [results, setResults] = useState<TestResultItem[]>([]);
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [exporting, setExporting] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<AttemptDetail | null>(null);

  const loadData = useCallback(async () => {
    if (!testId) {
      setLoading(false);
      setError("Invalid test id");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [test, resultRows] = await Promise.all([getTestById(testId), getTestResults(testId)]);
      setTestTitle(test.title);
      setTotalEnrolled(test.enrollmentCount);
      setResults(resultRows);
    } catch (apiError: any) {
      setError(getApiErrorMessage(apiError, "Unable to load results"));
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const sortedRows = useMemo(() => {
    const next = [...results];

    next.sort((a, b) => {
      if (sortField === "name") {
        const compare = a.studentName.localeCompare(b.studentName, undefined, {
          sensitivity: "base"
        });

        return sortDirection === "asc" ? compare : -compare;
      }

      const compare = a.score - b.score;
      return sortDirection === "asc" ? compare : -compare;
    });

    return next;
  }, [results, sortDirection, sortField]);

  const submitted = results.length;
  const averageScore =
    submitted > 0
      ? (results.reduce((sum, row) => sum + row.score, 0) / submitted).toFixed(2)
      : "0.00";
  const highestScore = submitted > 0 ? Math.max(...results.map((row) => row.score)) : 0;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection(field === "name" ? "asc" : "desc");
  };

  const handleExport = async () => {
    if (!testId) {
      return;
    }

    try {
      setExporting(true);
      await downloadResultsCsv(testId);
    } catch {
      showToast("Failed to export CSV", "error");
    } finally {
      setExporting(false);
    }
  };

  const handleOpenDetail = async (attemptId: string) => {
    if (!testId) {
      return;
    }

    setDrawerOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setSelectedAttempt(null);

    try {
      const detail = await getAttemptDetail(testId, attemptId);
      setSelectedAttempt(detail);
    } catch (apiError: any) {
      setDetailError(getApiErrorMessage(apiError, "Unable to load attempt detail"));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <nav className="text-sm text-slate-500">
            <Link href="/dashboard/tests" className="transition hover:text-slate-700">
              Tests
            </Link>
            <span className="px-2 text-slate-400">&gt;</span>
            <span>{testTitle}</span>
            <span className="px-2 text-slate-400">&gt;</span>
            <span className="text-slate-700">Results</span>
          </nav>

          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Results</h1>
        </div>

        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting || loading || !!error}
          className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Total Enrolled</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{totalEnrolled}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Submitted</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{submitted}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Average Score</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{averageScore}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Highest Score</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{highestScore}</p>
        </div>
      </section>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-6 w-44 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="inline-flex items-center gap-1 text-left"
                  >
                    Student Name
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <button
                    type="button"
                    onClick={() => toggleSort("score")}
                    className="inline-flex items-center gap-1 text-left"
                  >
                    Score / Total
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Percentage</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Submitted At</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {sortedRows.map((row, index) => {
                const percentage = row.totalMarks > 0 ? (row.score / row.totalMarks) * 100 : 0;

                return (
                  <tr key={row.attemptId} className="transition hover:bg-slate-50/60">
                    <td className="px-4 py-4 text-sm text-slate-700">{index + 1}</td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-900">{row.studentName}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{row.studentEmail}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">
                      {row.score} / {row.totalMarks}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">{percentage.toFixed(2)}%</td>
                    <td className="px-4 py-4 text-sm text-slate-700">{formatDateTime(row.submittedAt)}</td>
                    <td className="px-4 py-4 text-sm">
                      <button
                        type="button"
                        onClick={() => void handleOpenDetail(row.attemptId)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        View Detail
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AttemptDetailDrawer
        open={drawerOpen}
        loading={detailLoading}
        error={detailError}
        attempt={selectedAttempt}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
