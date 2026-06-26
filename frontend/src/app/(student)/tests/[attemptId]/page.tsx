"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  getAttempt,
  saveAnswer,
  submitAttempt,
  type AttemptPayload
} from "@/lib/api/student";

type SaveState = "idle" | "saving" | "saved";

type LocalQuestionState = {
  selectedOptionIds: string[];
  textAnswer: string;
};

function formatMMSS(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mm = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const ss = (safe % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function getTimerClass(seconds: number): string {
  if (seconds <= 60) {
    return "text-rose-600";
  }

  if (seconds <= 300) {
    return "text-amber-600";
  }

  return "text-emerald-600";
}

function normalizeAttemptId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default function AttemptPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = normalizeAttemptId(params?.attemptId);
  const router = useRouter();
  const { showToast } = useToast();

  const [attempt, setAttempt] = useState<AttemptPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(0);
  const [questionStates, setQuestionStates] = useState<Record<string, LocalQuestionState>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [timesUpSubmitting, setTimesUpSubmitting] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadAttempt = useCallback(async () => {
    if (!attemptId) {
      setError("Invalid attempt id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getAttempt(attemptId);

      if (response.isSubmitted) {
        showToast(`Test already submitted. Score: ${response.score ?? 0}/${response.totalMarks}`);
        router.replace("/tests");
        return;
      }

      setAttempt(response);
      setTimeRemainingSeconds(response.timeRemainingSeconds);

      const nextStates: Record<string, LocalQuestionState> = {};
      const nextSaveStates: Record<string, SaveState> = {};

      for (const item of response.attemptQuestions) {
        nextStates[item.id] = {
          selectedOptionIds: item.answer?.selectedOptionIds ?? [],
          textAnswer: item.answer?.textAnswer ?? ""
        };
        nextSaveStates[item.id] = "idle";
      }

      setQuestionStates(nextStates);
      setSaveStates(nextSaveStates);
      setCurrentQuestionIndex(0);
    } catch (apiError: any) {
      setError(getApiErrorMessage(apiError, "Unable to load attempt."));
    } finally {
      setLoading(false);
    }
  }, [attemptId, router, showToast]);

  useEffect(() => {
    void loadAttempt();

    return () => {
      const saveTimers = saveTimersRef.current;
      const savedTimers = savedTimersRef.current;

      Object.values(saveTimers).forEach((timer) => clearTimeout(timer));
      Object.values(savedTimers).forEach((timer) => clearTimeout(timer));
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (!attempt || attempt.isSubmitted || loading) {
      return;
    }

    if (timeRemainingSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setTimeRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [attempt, loading, timeRemainingSeconds]);

  const submitNow = useCallback(
    async (isAutomatic: boolean) => {
      if (!attempt || submitting || timesUpSubmitting) {
        return;
      }

      try {
        if (isAutomatic) {
          setTimesUpSubmitting(true);
        } else {
          setSubmitting(true);
        }

        const response = await submitAttempt({ attemptId: attempt.id });
        showToast(`Submitted. Score: ${response.score}/${response.totalMarks}`);
        router.replace("/tests");
      } catch (apiError: any) {
        showToast(getApiErrorMessage(apiError, "Unable to submit test"), "error");
        if (apiError?.response?.status === 400) {
          router.replace("/tests");
        }
      } finally {
        setSubmitting(false);
        setTimesUpSubmitting(false);
      }
    },
    [attempt, router, showToast, submitting, timesUpSubmitting]
  );

  useEffect(() => {
    if (!attempt || attempt.isSubmitted || loading) {
      return;
    }

    if (timeRemainingSeconds > 0 || timesUpSubmitting) {
      return;
    }

    void submitNow(true);
  }, [attempt, loading, submitNow, timeRemainingSeconds, timesUpSubmitting]);

  const answeredCount = useMemo(() => {
    if (!attempt) {
      return 0;
    }

    return attempt.attemptQuestions.reduce((count, item) => {
      const state = questionStates[item.id];

      if (!state) {
        return count;
      }

      if (item.question.type === "TEXT") {
        return state.textAnswer.trim() ? count + 1 : count;
      }

      return state.selectedOptionIds.length > 0 ? count + 1 : count;
    }, 0);
  }, [attempt, questionStates]);

  useEffect(() => {
    if (!attempt || attempt.attemptQuestions.length === 0) {
      return;
    }

    if (currentQuestionIndex >= attempt.attemptQuestions.length) {
      setCurrentQuestionIndex(0);
    }
  }, [attempt, currentQuestionIndex]);

  const queueSave = useCallback(
    (attemptQuestionId: string, nextState: LocalQuestionState) => {
      if (!attempt || timesUpSubmitting) {
        return;
      }

      const existingTimer = saveTimersRef.current[attemptQuestionId];
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      setSaveStates((current) => ({ ...current, [attemptQuestionId]: "saving" }));

      saveTimersRef.current[attemptQuestionId] = setTimeout(async () => {
        try {
          await saveAnswer({
            attemptId: attempt.id,
            attemptQuestionId,
            selectedOptionIds: nextState.selectedOptionIds,
            textAnswer: nextState.textAnswer
          });

          setSaveStates((current) => ({ ...current, [attemptQuestionId]: "saved" }));

          const existingSavedTimer = savedTimersRef.current[attemptQuestionId];
          if (existingSavedTimer) {
            clearTimeout(existingSavedTimer);
          }

          savedTimersRef.current[attemptQuestionId] = setTimeout(() => {
            setSaveStates((current) => ({ ...current, [attemptQuestionId]: "idle" }));
          }, 1500);
        } catch (apiError: any) {
          const message = getApiErrorMessage(apiError, "Failed to save answer");

          if (message === "Time expired, test auto-submitted") {
            showToast(message, "error");
            router.replace("/tests");
            return;
          }

          setSaveStates((current) => ({ ...current, [attemptQuestionId]: "idle" }));
          showToast(message, "error");
        }
      }, 800);
    },
    [attempt, router, showToast, timesUpSubmitting]
  );

  const updateText = (attemptQuestionId: string, value: string) => {
    const nextState: LocalQuestionState = {
      selectedOptionIds: [],
      textAnswer: value
    };

    setQuestionStates((current) => ({
      ...current,
      [attemptQuestionId]: nextState
    }));

    queueSave(attemptQuestionId, nextState);
  };

  const updateMcqSelection = (
    attemptQuestionId: string,
    optionId: string,
    mode: "single" | "multi",
    checked: boolean
  ) => {
    const previous =
      questionStates[attemptQuestionId] ?? { selectedOptionIds: [], textAnswer: "" };

    let nextSelectedOptionIds: string[] = [];

    if (mode === "single") {
      nextSelectedOptionIds = checked ? [optionId] : [];
    } else {
      const set = new Set(previous.selectedOptionIds);

      if (checked) {
        set.add(optionId);
      } else {
        set.delete(optionId);
      }

      nextSelectedOptionIds = Array.from(set);
    }

    const nextState: LocalQuestionState = {
      ...previous,
      selectedOptionIds: nextSelectedOptionIds
    };

    setQuestionStates((current) => {
      return {
        ...current,
        [attemptQuestionId]: nextState
      };
    });

    queueSave(attemptQuestionId, nextState);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading test...
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-rose-300/30 bg-rose-900/30 px-4 py-3 text-sm">
          {error ?? "Unable to load attempt."}
        </div>
      </div>
    );
  }

  const timerClass = getTimerClass(timeRemainingSeconds);
  const disableInputs = timesUpSubmitting || timeRemainingSeconds <= 0;
  const currentQuestion =
    attempt.attemptQuestions[currentQuestionIndex] ?? attempt.attemptQuestions[0] ?? null;
  const currentState = currentQuestion
    ? questionStates[currentQuestion.id] ?? { selectedOptionIds: [], textAnswer: "" }
    : { selectedOptionIds: [], textAnswer: "" };
  const currentSaveState = currentQuestion ? saveStates[currentQuestion.id] ?? "idle" : "idle";
  const isLastQuestion = currentQuestionIndex === attempt.attemptQuestions.length - 1;
  const isFirstQuestion = currentQuestionIndex === 0;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Student Test</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">{attempt.testTitle}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Question {currentQuestionIndex + 1} of {attempt.attemptQuestions.length}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Time left</p>
              <div className={`mt-1 text-3xl font-bold tabular-nums ${timerClass}`}>{formatMMSS(timeRemainingSeconds)}</div>
            </div>

            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm(
                  `You have answered ${answeredCount} of ${attempt.attemptQuestions.length} questions. Submit now?`
                );

                if (!confirmed) {
                  return;
                }

                void submitNow(false);
              }}
              disabled={submitting || timesUpSubmitting}
              className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit Test"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[180px_1fr] lg:px-8">
        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)] lg:overflow-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Navigator</p>
          <div className="mt-4 grid grid-cols-5 gap-2 lg:grid-cols-2">
            {attempt.attemptQuestions.map((question, index) => {
              const state = questionStates[question.id];
              const isAnswered =
                question.question.type === "TEXT"
                  ? Boolean(state?.textAnswer.trim())
                  : Boolean(state?.selectedOptionIds.length);
              const isCurrent = currentQuestionIndex === index;

              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setCurrentQuestionIndex(index)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    isCurrent
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : isAnswered
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Question {currentQuestionIndex + 1}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  {currentQuestion?.question.questionText}
                </h2>
                {currentQuestion?.question.type === "MCQ" ? (
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {currentQuestion.question.mcqMode === "single"
                      ? "(Select one correct option)"
                      : "(Select all correct options)"}
                  </p>
                ) : null}
              </div>

              <p
                className={`text-xs font-semibold ${
                  currentSaveState === "saving"
                    ? "text-amber-600"
                    : currentSaveState === "saved"
                    ? "text-emerald-600"
                    : "text-slate-400"
                }`}
              >
                {currentSaveState === "saving" ? "Saving..." : currentSaveState === "saved" ? "Saved" : ""}
              </p>
            </div>

            <div className="mt-6">
              {!currentQuestion ? null : currentQuestion.question.type === "TEXT" ? (
                <textarea
                  value={currentState.textAnswer}
                  onChange={(event) => updateText(currentQuestion.id, event.target.value)}
                  disabled={disableInputs}
                  rows={5}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:bg-white focus:ring-2 focus:ring-[var(--ring)]/20 disabled:opacity-60"
                  placeholder="Type your answer"
                />
              ) : (
                <div className="space-y-3">
                  {currentQuestion.question.mcqOptions.map((option) => {
                    const checked = currentState.selectedOptionIds.includes(option.id);
                    const isSingle = currentQuestion.question.mcqMode === "single";

                    return (
                      <label
                        key={option.id}
                        className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                          checked
                            ? "border-[var(--primary)] bg-indigo-50 text-slate-900"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        <input
                          type={isSingle ? "radio" : "checkbox"}
                          name={`q-${currentQuestion.id}`}
                          checked={checked}
                          disabled={disableInputs}
                          onChange={(event) => {
                            updateMcqSelection(
                              currentQuestion.id,
                              option.id,
                              currentQuestion.question.mcqMode,
                              event.target.checked
                            );
                          }}
                          className="mt-1 h-4 w-4 border-slate-400 text-[var(--primary)] focus:ring-[var(--primary)]"
                        />
                        <span>{option.optionText}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
              <button
                type="button"
                onClick={() => setCurrentQuestionIndex((value) => Math.max(0, value - 1))}
                disabled={disableInputs || isFirstQuestion}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              <div className="text-sm text-slate-500">
                {answeredCount} of {attempt.attemptQuestions.length} answered
              </div>

              {isLastQuestion ? (
                <button
                  type="button"
                  onClick={() => {
                    const confirmed = window.confirm(
                      `You have answered ${answeredCount} of ${attempt.attemptQuestions.length} questions. Submit now?`
                    );

                    if (!confirmed) {
                      return;
                    }

                    void submitNow(false);
                  }}
                  disabled={submitting || timesUpSubmitting}
                  className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Submitting..." : "Submit Test"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentQuestionIndex((value) => Math.min(attempt.attemptQuestions.length - 1, value + 1))}
                  disabled={disableInputs}
                  className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                </button>
              )}
            </div>
          </section>
        </main>
      </div>

      {timesUpSubmitting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 text-center">
          <div className="rounded-2xl border border-rose-300/40 bg-rose-900/30 px-6 py-5">
            <p className="text-lg font-semibold text-rose-100">Time's up - submitting...</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
