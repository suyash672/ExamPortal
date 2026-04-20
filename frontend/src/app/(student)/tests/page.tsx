"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  beginTest,
  enrollInTest,
  getStudentTests,
  type StudentTestSummary
} from "@/lib/api/student";

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

function formatStartsIn(startTime: string): string {
  const now = Date.now();
  const diffMs = new Date(startTime).getTime() - now;

  if (diffMs <= 0) {
    return "Starts now";
  }

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `Starts in ${days}d ${hours % 24}h`;
  }

  if (hours > 0) {
    return `Starts in ${hours}h ${minutes % 60}m`;
  }

  return `Starts in ${minutes}m`;
}

function isBetween(start: string, end: string): boolean {
  const now = Date.now();
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return now >= startMs && now < endMs;
}

export default function StudentTestsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [tests, setTests] = useState<StudentTestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [enrollKey, setEnrollKey] = useState("");
  const [enrollingTestId, setEnrollingTestId] = useState<string | null>(null);
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);

  const [beginLoadingId, setBeginLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getStudentTests();
      setTests(data);
    } catch {
      setError("Unable to load tests. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const availableToEnroll = useMemo(
    () => tests.filter((test) => !test.enrolled),
    [tests]
  );

  const enrolledTests = useMemo(() => tests.filter((test) => test.enrolled), [tests]);

  const openEnrollModal = (testId: string) => {
    setEnrollingTestId(testId);
    setEnrollKey("");
    setEnrollModalOpen(true);
  };

  const submitEnrollment = async () => {
    if (!enrollingTestId) {
      return;
    }

    try {
      setEnrollSubmitting(true);
      await enrollInTest({ testId: enrollingTestId, enrollmentKey: enrollKey });
      showToast("Enrollment successful");
      setEnrollModalOpen(false);
      setEnrollingTestId(null);
      await load();
    } catch (apiError: any) {
      showToast(getApiErrorMessage(apiError, "Enrollment failed"), "error");
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const beginAttempt = async (enrollmentId: string | null) => {
    if (!enrollmentId) {
      return;
    }

    try {
      setBeginLoadingId(enrollmentId);
      const attempt = await beginTest({ enrollmentId });
      router.push(`/tests/${attempt.id}`);
    } catch (apiError: any) {
      showToast(getApiErrorMessage(apiError, "Unable to begin test"), "error");
      await load();
    } finally {
      setBeginLoadingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Student Tests</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">My tests</h1>
        <p className="mt-2 text-sm text-slate-500">Enroll, begin, and resume your active tests.</p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Available to Enroll</h2>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : availableToEnroll.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-sm text-slate-500">
            No enrollable tests right now.
          </div>
        ) : (
          <div className="grid gap-3">
            {availableToEnroll.map((test) => (
              <article key={test.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{test.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDateTime(test.startTime)} - {formatDateTime(test.endTime)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">Total marks: {test.totalMarks}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEnrollModal(test.id)}
                    className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
                  >
                    Enroll
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">My Enrolled Tests</h2>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : enrolledTests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-sm text-slate-500">
            You have not enrolled in any tests yet.
          </div>
        ) : (
          <div className="grid gap-3">
            {enrolledTests.map((test) => {
              const hasAttempt = Boolean(test.attempt);
              const isCompleted = Boolean(test.attempt?.isSubmitted);
              const inActiveWindow = isBetween(test.startTime, test.endTime);
              const resumable =
                Boolean(test.attempt) &&
                !test.attempt!.isSubmitted &&
                (test.attempt?.timeRemainingSeconds ?? 0) > 0;

              return (
                <article key={test.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{test.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatDateTime(test.startTime)} - {formatDateTime(test.endTime)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">Total marks: {test.totalMarks}</p>
                    </div>

                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      {!hasAttempt && !inActiveWindow ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
                          {formatStartsIn(test.startTime)}
                        </span>
                      ) : null}

                      {isCompleted ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                          Completed - Score: {test.attempt?.score ?? 0}/{test.totalMarks}
                        </span>
                      ) : null}

                      {resumable ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                          Resumed
                        </span>
                      ) : null}

                      {inActiveWindow && !isCompleted ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (test.attempt?.id) {
                              router.push(`/tests/${test.attempt.id}`);
                              return;
                            }

                            void beginAttempt(test.enrollmentId);
                          }}
                          disabled={beginLoadingId === test.enrollmentId}
                          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {beginLoadingId === test.enrollmentId
                            ? "Starting..."
                            : test.attempt?.id
                            ? "Resume Test"
                            : "Begin Test"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {enrollModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Enroll</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Enter enrollment key</h3>
              </div>
              <button
                type="button"
                onClick={() => setEnrollModalOpen(false)}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close enrollment modal"
              >
                ×
              </button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="enrollKey" className="text-sm font-medium text-slate-700">
                Enrollment key
              </label>
              <input
                id="enrollKey"
                type="text"
                value={enrollKey}
                onChange={(event) => setEnrollKey(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEnrollModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitEnrollment()}
                disabled={enrollSubmitting || !enrollKey.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {enrollSubmitting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : null}
                {enrollSubmitting ? "Enrolling..." : "Enroll"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
