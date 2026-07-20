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
  blockStudentAttempt,
  type AttemptDetail,
  type TestResultItem
} from "@/lib/api/results";
import { getTestById, releaseTestResults, type TestDetails } from "@/lib/api/tests";

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
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  
  const [viewMode, setViewMode] = useState<"list" | "monitor">("list");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [testDetails, setTestDetails] = useState<TestDetails | null>(null);
  const [releasing, setReleasing] = useState(false);

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
      setTestDetails(test);
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

  useEffect(() => {
    if (!autoRefresh || loading) return;
    const interval = setInterval(() => {
      // Refresh without full loading spinner for smooth updates
      void Promise.all([getTestById(testId), getTestResults(testId)])
        .then(([test, resultRows]) => {
          setTestTitle(test.title);
          setTotalEnrolled(test.enrollmentCount);
          setTestDetails(test);
          setResults(resultRows);
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, loading, testId]);

  const sortedRows = useMemo(() => {
    const next = [...results];

    next.sort((a, b) => {
      if (sortField === "name") {
        const compare = a.studentName.localeCompare(b.studentName, undefined, {
          sensitivity: "base"
        });

        return sortDirection === "asc" ? compare : -compare;
      }

      const scoreA = a.score ?? -1;
      const scoreB = b.score ?? -1;
      const compare = scoreA - scoreB;
      return sortDirection === "asc" ? compare : -compare;
    });

    return next;
  }, [results, sortDirection, sortField]);

  const submittedRows = useMemo(() => results.filter((row) => row.isSubmitted), [results]);
  const submitted = submittedRows.length;
  const averageScore =
    submitted > 0
      ? (submittedRows.reduce((sum, row) => sum + (row.score ?? 0), 0) / submitted).toFixed(2)
      : "0.00";
  const highestScore = submitted > 0 ? Math.max(...submittedRows.map((row) => row.score ?? 0)) : 0;

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

    setSelectedAttemptId(attemptId);
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

  const handleRefreshDetail = async () => {
    if (!testId || !selectedAttemptId) {
      return;
    }

    setDetailLoading(true);
    setDetailError(null);

    try {
      const detail = await getAttemptDetail(testId, selectedAttemptId);
      setSelectedAttempt(detail);
    } catch (apiError: any) {
      setDetailError(getApiErrorMessage(apiError, "Unable to refresh details"));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToggleBlock = async (isBlocked: boolean) => {
    if (!testId || !selectedAttemptId) {
      return;
    }

    const action = isBlocked ? "block" : "unblock";
    const confirmed = window.confirm(`Are you sure you want to ${action} this student?`);
    if (!confirmed) {
      return;
    }

    setDetailLoading(true);
    setDetailError(null);

    try {
      await blockStudentAttempt(testId, selectedAttemptId, isBlocked);
      showToast(`Student successfully ${isBlocked ? "blocked" : "unblocked"}.`);
      
      const detail = await getAttemptDetail(testId, selectedAttemptId);
      setSelectedAttempt(detail);
      void loadData();
    } catch (apiError: any) {
      setDetailError(getApiErrorMessage(apiError, `Unable to ${action} student`));
      showToast(`Failed to ${action} student.`, "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReleaseResults = async () => {
    if (!testId || !testDetails) return;

    const now = new Date();
    const endTime = new Date(testDetails.endTime);
    
    let confirmMsg = "Are you sure you want to release exam results to students?";
    if (now < endTime) {
      confirmMsg = "Exam time hasn't finished yet. Are you sure you want to release exam results now?";
    }

    const confirmed = window.confirm(confirmMsg);
    if (!confirmed) return;

    setReleasing(true);
    try {
      await releaseTestResults(testId);
      showToast("Results successfully released to students!");
      void loadData();
    } catch (apiError: any) {
      showToast(getApiErrorMessage(apiError, "Failed to release results"), "error");
    } finally {
      setReleasing(false);
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

        <div className="flex items-center gap-3">
          {testDetails && (
            <button
              type="button"
              onClick={handleReleaseResults}
              disabled={releasing || testDetails.resultsReveal}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                testDetails.resultsReveal
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-teal-600 text-white hover:bg-teal-700"
              }`}
            >
              {testDetails.resultsReveal ? "✅ Results Released" : releasing ? "Releasing..." : "📢 Release Results"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setViewMode((prev) => (prev === "list" ? "monitor" : "list"))}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {viewMode === "list" ? "📺 Live Proctoring Room" : "📋 View Results List"}
          </button>

          {viewMode === "monitor" && (
            <label className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
              />
              <span>Live Autorefresh (5s)</span>
            </label>
          )}

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || loading || !!error}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
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
      ) : viewMode === "monitor" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Proctoring Room Monitor</h2>
            <p className="text-xs text-slate-500 font-medium">
              {results.length} total students enrolled / attempting
            </p>
          </div>

          {sortedRows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No student attempts are active or submitted yet for this test.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sortedRows.map((row) => {
                const activeLogs = (row as any).activities ?? [];
                const alertsCount = activeLogs.length;

                let statusText = "Active";
                let statusClass = "bg-emerald-50 text-emerald-800 ring-emerald-600/20";
                let pulseClass = "bg-emerald-600";

                if (row.isBlocked) {
                  statusText = "Blocked";
                  statusClass = "bg-rose-50 text-rose-800 ring-rose-600/20";
                  pulseClass = "bg-rose-600";
                } else if (row.isSubmitted) {
                  statusText = "Submitted";
                  statusClass = "bg-slate-50 text-slate-700 ring-slate-600/20";
                  pulseClass = "bg-slate-500";
                }

                return (
                  <div
                    key={row.attemptId}
                    className={`rounded-3xl border p-5 bg-white shadow-sm flex flex-col justify-between transition-all duration-200 ${
                      row.isBlocked
                        ? "border-rose-300 ring-2 ring-rose-500/10"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-semibold text-slate-900">{row.studentName}</h4>
                          <p className="text-xs text-slate-500 mt-0.5">{row.studentEmail}</p>
                        </div>

                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusClass}`}>
                          {!row.isSubmitted && !row.isBlocked && (
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
                          )}
                          {statusText}
                        </span>
                      </div>

                      {/* Alerts Count */}
                      <div className="mt-4 flex items-center justify-between border-b border-slate-100 pb-3">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Security Alerts</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                          alertsCount > 0
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-100 text-slate-600"
                        }`}>
                          {alertsCount > 0 ? `⚠️ ${alertsCount} alerts` : "✅ Safe (0)"}
                        </span>
                      </div>

                      {/* Activity Feed */}
                      <div className="mt-3">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Recent Activity Feed</p>
                        <div className="mt-2 space-y-1.5 max-h-24 overflow-y-auto">
                          {activeLogs.length > 0 ? (
                            activeLogs.map((act: any, idx: number) => {
                              const timeStr = new Intl.DateTimeFormat("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit"
                              }).format(new Date(act.timestamp));

                              return (
                                <div key={idx} className="rounded-lg bg-slate-50 p-2 text-[11px] border border-slate-100 flex items-start gap-2">
                                  <span className="font-semibold text-slate-400 shrink-0">{timeStr}</span>
                                  <div className="break-words min-w-0 flex-1">
                                    <span className="font-bold text-rose-600 mr-1">[{act.type}]</span>
                                    <span className="text-slate-600 font-medium">{act.message}</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-xs text-slate-400 italic py-2">No activities logged yet.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const nextBlockState = !row.isBlocked;
                          const action = nextBlockState ? "block" : "unblock";
                          const confirmed = window.confirm(`Are you sure you want to ${action} this student?`);
                          if (!confirmed) return;

                          try {
                            await blockStudentAttempt(testId, row.attemptId, nextBlockState);
                            showToast(`Student successfully ${nextBlockState ? "blocked" : "unblocked"}.`);
                            void loadData();
                          } catch {
                            showToast(`Failed to ${action} student.`, "error");
                          }
                        }}
                        disabled={row.isSubmitted}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                          row.isBlocked
                            ? "bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-500"
                            : "bg-rose-600 border-rose-700 text-white hover:bg-rose-500"
                        }`}
                      >
                        {row.isBlocked ? "🔓 Unblock" : "🚫 Block student"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleOpenDetail(row.attemptId)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                const percentage = row.score !== null && row.totalMarks > 0 ? (row.score / row.totalMarks) * 100 : 0;

                return (
                  <tr key={row.attemptId} className="transition hover:bg-slate-50/60">
                    <td className="px-4 py-4 text-sm text-slate-700">{index + 1}</td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{row.studentName}</span>
                        {row.isBlocked && (
                          <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                            Blocked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">{row.studentEmail}</td>
                    <td className="px-4 py-4 text-sm text-slate-700">
                      {row.isSubmitted && row.score !== null ? (
                        `${row.score} / ${row.totalMarks}`
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600" />
                          Ongoing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">
                      {row.isSubmitted && row.score !== null ? `${percentage.toFixed(2)}%` : "-"}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">
                      {row.isSubmitted ? formatDateTime(row.submittedAt) : "In Progress"}
                    </td>
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
        onRefresh={handleRefreshDetail}
        onToggleBlock={handleToggleBlock}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedAttemptId(null);
        }}
      />
    </div>
  );
}
