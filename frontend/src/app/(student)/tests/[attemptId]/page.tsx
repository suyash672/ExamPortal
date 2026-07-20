"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  getAttempt,
  saveAnswer,
  submitAttempt,
  submitTestPreview,
  logAttemptActivity,
  type AttemptPayload
} from "@/lib/api/student";

type SaveState = "idle" | "saving" | "saved";

type LocalQuestionState = {
  selectedOptionIds: string[];
  textAnswer: string;
  isMarkedForReview: boolean;
  isVisited: boolean;
};

type QuestionCategory =
  | "ATTEMPTED"
  | "NOT_ATTEMPTED"
  | "ATTEMPTED_AND_REVIEW"
  | "NOT_ATTEMPTED_AND_REVIEW"
  | "NOT_VISITED";

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
    return "text-rose-400 animate-pulse";
  }
  if (seconds <= 300) {
    return "text-amber-400";
  }
  return "text-emerald-400";
}

function normalizeAttemptId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function getQuestionCategory(
  question: any,
  state: LocalQuestionState | undefined
): QuestionCategory {
  if (!state) return "NOT_VISITED";

  const isVisited = state.isVisited;
  const isMarked = state.isMarkedForReview;
  const isAnswered =
    question.type === "TEXT"
      ? Boolean(state.textAnswer.trim())
      : Boolean(state.selectedOptionIds && state.selectedOptionIds.length > 0);

  if (isAnswered && isMarked) return "ATTEMPTED_AND_REVIEW";
  if (!isAnswered && isMarked) return "NOT_ATTEMPTED_AND_REVIEW";
  if (isAnswered) return "ATTEMPTED";
  if (isVisited && !isAnswered) return "NOT_ATTEMPTED";
  return "NOT_VISITED";
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [started, setStarted] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

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
        router.replace(attemptId.startsWith("preview-") ? "/dashboard/tests" : "/tests");
        return;
      }

      setAttempt(response);
      setTimeRemainingSeconds(response.timeRemainingSeconds);
      setIsFullscreen(response.useFullscreen ? !!document.fullscreenElement : false);

      const nextStates: Record<string, LocalQuestionState> = {};
      const nextSaveStates: Record<string, SaveState> = {};

      for (let i = 0; i < response.attemptQuestions.length; i++) {
        const item = response.attemptQuestions[i];
        nextStates[item.id] = {
          selectedOptionIds: item.answer?.selectedOptionIds ?? [],
          textAnswer: item.answer?.textAnswer ?? "",
          isMarkedForReview: false,
          isVisited: i === 0 // Mark first question visited on load
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

  // Fullscreen Change Handler
  useEffect(() => {
    if (!attempt || !attempt.useFullscreen) return;

    const handleFullscreenChange = () => {
      const currentFullscreen = !!document.fullscreenElement;
      setIsFullscreen(currentFullscreen);

      if (!currentFullscreen && !attempt.isSubmitted) {
        if (attempt.logActivities) {
          void logAttemptActivity(attempt.id, {
            type: "FULLSCREEN_EXIT",
            message: "Student exited fullscreen mode."
          });
          showToast("Activity logged: Exited fullscreen mode", "error");
        }
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [attempt, showToast]);

  // Poll attempt status
  useEffect(() => {
    if (!attempt || attempt.isSubmitted || loading) return;

    const pollInterval = setInterval(async () => {
      try {
        const freshAttempt = await getAttempt(attempt.id);
        if (freshAttempt.isBlocked !== attempt.isBlocked) {
          setAttempt(freshAttempt);
        }
      } catch (err) {
        // Silently ignore
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [attempt, loading]);

  // Focus loss tracking
  useEffect(() => {
    if (!attempt || !attempt.logActivities || attempt.isSubmitted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        void logAttemptActivity(attempt.id, {
          type: "FOCUS_LOSS",
          message: "Student switched tabs or minimized the browser."
        });
        showToast("Activity logged: Switched tabs / lost focus", "error");
      }
    };

    const handleBlur = () => {
      void logAttemptActivity(attempt.id, {
        type: "FOCUS_LOSS",
        message: "Student clicked outside the browser window."
      });
      showToast("Activity logged: Lost window focus", "error");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [attempt, showToast]);

  // Copy-paste prevention
  useEffect(() => {
    if (!attempt || !attempt.preventCopyPaste) return;

    const preventDefault = (e: Event) => {
      e.preventDefault();
      showToast("Copy, cut, and paste options are disabled for this test.", "error");
      if (attempt.logActivities) {
        void logAttemptActivity(attempt.id, {
          type: "COPY_PASTE_ATTEMPT",
          message: `Student attempted copy/paste or right-click: ${e.type}`
        });
      }
    };

    document.addEventListener("copy", preventDefault);
    document.addEventListener("paste", preventDefault);
    document.addEventListener("cut", preventDefault);
    document.addEventListener("contextmenu", preventDefault);

    return () => {
      document.removeEventListener("copy", preventDefault);
      document.removeEventListener("paste", preventDefault);
      document.removeEventListener("cut", preventDefault);
      document.removeEventListener("contextmenu", preventDefault);
    };
  }, [attempt, showToast]);

  // Timer countdown
  useEffect(() => {
    if (!attempt || attempt.isSubmitted || loading) return;
    if (timeRemainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setTimeRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [attempt, loading, timeRemainingSeconds]);

  const submitNow = useCallback(
    async (isAutomatic: boolean) => {
      if (!attempt || submitting || timesUpSubmitting) return;

      try {
        if (isAutomatic) {
          setTimesUpSubmitting(true);
        } else {
          setSubmitting(true);
        }

        let response;
        if (attemptId.startsWith("preview-")) {
          const testId = attemptId.replace("preview-", "");
          const answersPayload: Record<string, { selectedOptionIds: string[]; textAnswer: string }> = {};
          for (const item of attempt.attemptQuestions) {
            const state = questionStates[item.id];
            if (state) {
              answersPayload[item.id] = {
                selectedOptionIds: state.selectedOptionIds,
                textAnswer: state.textAnswer
              };
            }
          }
          response = await submitTestPreview(testId, answersPayload);
          showToast(`Preview Submitted. Mock Score: ${response.score}/${response.totalMarks}`);
          router.replace("/dashboard/tests");
        } else {
          response = await submitAttempt({ attemptId: attempt.id });
          showToast(`Submitted. Score: ${response.score}/${response.totalMarks}`);
          router.replace("/tests");
        }
      } catch (apiError: any) {
        showToast(getApiErrorMessage(apiError, "Unable to submit test"), "error");
        if (apiError?.response?.status === 400) {
          router.replace(attemptId.startsWith("preview-") ? "/dashboard/tests" : "/tests");
        }
      } finally {
        setSubmitting(false);
        setTimesUpSubmitting(false);
      }
    },
    [attempt, attemptId, questionStates, router, showToast, submitting, timesUpSubmitting]
  );

  useEffect(() => {
    if (!attempt || attempt.isSubmitted || loading) return;
    if (timeRemainingSeconds > 0 || timesUpSubmitting) return;

    void submitNow(true);
  }, [attempt, loading, submitNow, timeRemainingSeconds, timesUpSubmitting]);

  // Overall Summary Category Counts
  const summaryCounts = useMemo(() => {
    if (!attempt) {
      return { attempted: 0, notAttempted: 0, attemptedReview: 0, notAttemptedReview: 0, notVisited: 0 };
    }

    let attempted = 0;
    let notAttempted = 0;
    let attemptedReview = 0;
    let notAttemptedReview = 0;
    let notVisited = 0;

    for (const item of attempt.attemptQuestions) {
      const category = getQuestionCategory(item.question, questionStates[item.id]);
      if (category === "ATTEMPTED") attempted++;
      else if (category === "NOT_ATTEMPTED") notAttempted++;
      else if (category === "ATTEMPTED_AND_REVIEW") attemptedReview++;
      else if (category === "NOT_ATTEMPTED_AND_REVIEW") notAttemptedReview++;
      else if (category === "NOT_VISITED") notVisited++;
    }

    return { attempted, notAttempted, attemptedReview, notAttemptedReview, notVisited };
  }, [attempt, questionStates]);

  const answeredCount = summaryCounts.attempted + summaryCounts.attemptedReview;

  useEffect(() => {
    if (!attempt || attempt.attemptQuestions.length === 0) return;
    if (currentQuestionIndex >= attempt.attemptQuestions.length) {
      setCurrentQuestionIndex(0);
    }
  }, [attempt, currentQuestionIndex]);

  const queueSave = useCallback(
    (attemptQuestionId: string, nextState: LocalQuestionState) => {
      if (!attempt || timesUpSubmitting) return;

      const existingTimer = saveTimersRef.current[attemptQuestionId];
      if (existingTimer) clearTimeout(existingTimer);

      setSaveStates((current) => ({ ...current, [attemptQuestionId]: "saving" }));

      saveTimersRef.current[attemptQuestionId] = setTimeout(async () => {
        try {
          if (!attemptId.startsWith("preview-")) {
            await saveAnswer({
              attemptId: attempt.id,
              attemptQuestionId,
              selectedOptionIds: nextState.selectedOptionIds,
              textAnswer: nextState.textAnswer
            });
          }

          setSaveStates((current) => ({ ...current, [attemptQuestionId]: "saved" }));

          const clearSavedTimer = savedTimersRef.current[attemptQuestionId];
          if (clearSavedTimer) clearTimeout(clearSavedTimer);

          savedTimersRef.current[attemptQuestionId] = setTimeout(() => {
            setSaveStates((current) => ({ ...current, [attemptQuestionId]: "idle" }));
          }, 1500);
        } catch (apiError: any) {
          setSaveStates((current) => ({ ...current, [attemptQuestionId]: "idle" }));
          showToast(getApiErrorMessage(apiError, "Failed to save answer"), "error");
        }
      }, 300);
    },
    [attempt, attemptId, showToast, timesUpSubmitting]
  );

  const goToQuestion = (index: number) => {
    if (!attempt || index < 0 || index >= attempt.attemptQuestions.length) return;
    const targetItem = attempt.attemptQuestions[index];
    setQuestionStates((prev) => ({
      ...prev,
      [targetItem.id]: {
        ...prev[targetItem.id],
        isVisited: true
      }
    }));
    setCurrentQuestionIndex(index);
  };

  const toggleOption = (attemptQuestionId: string, optionId: string, mcqMode: "single" | "multi") => {
    if (attempt?.isBlocked) return;

    setQuestionStates((current) => {
      const existing = current[attemptQuestionId] ?? {
        selectedOptionIds: [],
        textAnswer: "",
        isMarkedForReview: false,
        isVisited: true
      };

      let nextOptionIds: string[] = [];
      if (optionId === "CLEAR_ALL") {
        nextOptionIds = [];
      } else if (mcqMode === "single") {
        nextOptionIds = existing.selectedOptionIds.includes(optionId) ? [] : [optionId];
      } else {
        nextOptionIds = existing.selectedOptionIds.includes(optionId)
          ? existing.selectedOptionIds.filter((id) => id !== optionId)
          : [...existing.selectedOptionIds, optionId];
      }

      const nextState: LocalQuestionState = {
        ...existing,
        selectedOptionIds: nextOptionIds,
        isVisited: true
      };

      queueSave(attemptQuestionId, nextState);
      return { ...current, [attemptQuestionId]: nextState };
    });
  };

  const updateText = (attemptQuestionId: string, value: string) => {
    if (attempt?.isBlocked) return;

    setQuestionStates((current) => {
      const existing = current[attemptQuestionId] ?? {
        selectedOptionIds: [],
        textAnswer: "",
        isMarkedForReview: false,
        isVisited: true
      };
      const nextState: LocalQuestionState = {
        ...existing,
        textAnswer: value,
        isVisited: true
      };
      queueSave(attemptQuestionId, nextState);
      return { ...current, [attemptQuestionId]: nextState };
    });
  };

  const toggleMarkForReview = (attemptQuestionId: string) => {
    setQuestionStates((current) => {
      const existing = current[attemptQuestionId] ?? {
        selectedOptionIds: [],
        textAnswer: "",
        isMarkedForReview: false,
        isVisited: true
      };
      return {
        ...current,
        [attemptQuestionId]: {
          ...existing,
          isMarkedForReview: !existing.isMarkedForReview,
          isVisited: true
        }
      };
    });
  };

  const enterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      showToast("Unable to enter fullscreen mode", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent"></div>
          <p className="text-sm font-semibold tracking-wide text-slate-300">Loading Exam Workspace...</p>
        </div>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 text-center text-white">
        <div className="max-w-md space-y-4 rounded-3xl border border-slate-800 bg-slate-800/80 p-8 shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-2xl text-rose-400">
            ⚠️
          </div>
          <h2 className="text-xl font-bold">{error || "Attempt unavailable"}</h2>
          <button
            type="button"
            onClick={() => router.replace("/tests")}
            className="rounded-xl bg-slate-700 px-6 py-2.5 text-sm font-semibold hover:bg-slate-600 transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Blocked Screen
  if (attempt.isBlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center text-white">
        <div className="max-w-md space-y-4 rounded-3xl border border-rose-500/30 bg-rose-950/40 p-8 shadow-2xl backdrop-blur-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-600 text-3xl">
            🔒
          </div>
          <h2 className="text-2xl font-bold text-rose-200">Attempt Blocked by Teacher</h2>
          <p className="text-sm text-slate-300">
            Your exam attempt has been temporarily suspended by the proctor due to policy violations.
          </p>
        </div>
      </div>
    );
  }

  // Fullscreen Entry Overlay
  if (attempt.useFullscreen && !started && !document.fullscreenElement) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center text-white">
        <div className="max-w-lg space-y-5 rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-500/20 text-3xl text-teal-400">
            🖥️
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">{attempt.testTitle}</h2>
            <p className="mt-2 text-sm text-slate-400">
              This exam requires Fullscreen Mode. Please click below to begin your attempt.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await enterFullscreen();
              setStarted(true);
            }}
            className="w-full rounded-2xl bg-teal-500 py-3.5 text-base font-bold text-slate-950 shadow-lg transition hover:bg-teal-400"
          >
            Enter Fullscreen & Start Exam
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = attempt.attemptQuestions[currentQuestionIndex];
  const currentState = (currentQuestion ? questionStates[currentQuestion.id] : null) ?? {
    selectedOptionIds: [],
    textAnswer: "",
    isMarkedForReview: false,
    isVisited: true
  };
  const currentSaveState = currentQuestion ? saveStates[currentQuestion.id] ?? "idle" : "idle";
  const disableInputs = submitting || timesUpSubmitting || attempt.isBlocked;
  const timerClass = getTimerClass(timeRemainingSeconds);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans flex flex-col">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-md border-b border-slate-800">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-teal-500/20 px-2.5 py-1 text-xs font-extrabold uppercase tracking-widest text-teal-400 border border-teal-500/30">
              EXAM PORTAL
            </span>
            <h1 className="text-lg font-bold text-white truncate max-w-md sm:max-w-xl">
              {attempt.testTitle}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Countdown Timer */}
            <div className="flex items-center gap-2 rounded-xl bg-slate-800/90 px-3.5 py-1.5 border border-slate-700 shadow-inner">
              <span className="text-xs font-semibold uppercase text-slate-400">Time:</span>
              <span className={`font-mono text-xl font-bold tabular-nums ${timerClass}`}>
                ⏱️ {formatMMSS(timeRemainingSeconds)}
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm(
                  `You have answered ${answeredCount} of ${attempt.attemptQuestions.length} questions.\n\nAre you sure you want to submit your exam now?`
                );
                if (confirmed) {
                  void submitNow(false);
                }
              }}
              disabled={disableInputs}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow transition hover:bg-rose-500 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Test"}
            </button>
          </div>
        </div>
      </header>

      {/* Main 2-Column Container */}
      <div className="flex-1 mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left Column: Question Area */}
        <main className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            {/* Question Header & Status Badge */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold uppercase tracking-wider text-slate-700">
                  Question {currentQuestionIndex + 1}
                </span>
                <span className="text-xs text-slate-400 font-medium">of {attempt.attemptQuestions.length}</span>
              </div>

              <div className="flex items-center gap-3">
                <p className={`text-xs font-bold ${
                  currentSaveState === "saving" ? "text-amber-600" : currentSaveState === "saved" ? "text-emerald-600" : "text-slate-400"
                }`}>
                  {currentSaveState === "saving" ? "Saving..." : currentSaveState === "saved" ? "✓ Saved" : ""}
                </p>

                <button
                  type="button"
                  onClick={() => toggleOption(currentQuestion.id, "CLEAR_ALL", "multi")}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                  title="Clear selected option"
                >
                  🧹 Clear Selection
                </button>
              </div>
            </div>

            {/* Question Text & Content */}
            <div className="mt-4 space-y-4">
              {currentQuestion?.question.questionText && (
                <div
                  className="text-lg font-semibold text-slate-900 leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: currentQuestion.question.questionText }}
                />
              )}

              {/* Question Image (Full Width - No Blank Right Space) */}
              {currentQuestion?.question.imageUrl && (
                <div className="mt-2 w-full">
                  <img
                    src={currentQuestion.question.imageUrl.startsWith("http") ? currentQuestion.question.imageUrl : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}${currentQuestion.question.imageUrl}`}
                    alt="Question context"
                    onClick={() => {
                      const imgUrl = currentQuestion.question.imageUrl;
                      if (!imgUrl) return;
                      const url = imgUrl.startsWith("http")
                        ? imgUrl
                        : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}${imgUrl}`;
                      setZoomImageUrl(url);
                    }}
                    className="w-full rounded-2xl object-contain border border-slate-200 bg-white shadow-sm cursor-zoom-in hover:shadow-md transition"
                    title="Click to expand preview"
                  />
                  <p className="mt-1 text-[11px] font-medium text-slate-400">🔍 Click image to enlarge preview</p>
                </div>
              )}

              {/* Question Choices (MCQ OR Text) */}
              {currentQuestion?.question.type === "MCQ" ? (
                <div className="mt-4 space-y-2.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    {currentQuestion.question.mcqMode === "single" ? "Select one option:" : "Select all that apply:"}
                  </p>
                  {currentQuestion.question.mcqOptions.map((option) => {
                    const checked = currentState.selectedOptionIds.includes(option.id);

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => toggleOption(currentQuestion.id, option.id, currentQuestion.question.mcqMode)}
                        className={`w-full flex items-start gap-3.5 rounded-2xl border p-4 cursor-pointer text-left transition ${
                          checked
                            ? "border-[var(--primary)] bg-teal-50/50 text-slate-900 shadow-sm ring-2 ring-[var(--primary)]/20 font-medium"
                            : "border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                          checked
                            ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                            : "border-slate-400 bg-white"
                        }`}>
                          {checked && <span className="h-1.5 w-1.5 rounded-full bg-white"></span>}
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                          {option.optionText && (
                            <span className="font-semibold text-sm leading-snug" dangerouslySetInnerHTML={{ __html: option.optionText }} />
                          )}
                          {option.imageUrl && (
                            <div className="max-w-full mt-1">
                              <img
                                src={option.imageUrl.startsWith("http") ? option.imageUrl : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}${option.imageUrl}`}
                                alt={`Option ${option.optionText}`}
                                className="max-h-28 rounded-xl object-contain border border-slate-200 bg-white"
                              />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Type your text answer:</p>
                  <textarea
                    value={currentState.textAnswer}
                    onChange={(event) => updateText(currentQuestion.id, event.target.value)}
                    disabled={disableInputs}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20 disabled:opacity-60"
                    placeholder="Type your detailed answer here..."
                  />
                </div>
              )}
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleMarkForReview(currentQuestion.id)}
                className={`rounded-xl px-4 py-2.5 text-xs font-bold transition border ${
                  currentState.isMarkedForReview
                    ? "border-purple-600 bg-purple-600 text-white shadow-sm"
                    : "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
                }`}
              >
                {currentState.isMarkedForReview ? "🔖 Marked for Review" : "🏷️ Mark for Review"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToQuestion(currentQuestionIndex - 1)}
                disabled={currentQuestionIndex === 0 || disableInputs}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                ← Previous
              </button>

              <button
                type="button"
                onClick={() => goToQuestion(currentQuestionIndex + 1)}
                disabled={currentQuestionIndex === attempt.attemptQuestions.length - 1 || disableInputs}
                className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[var(--primary-hover)] disabled:opacity-40"
              >
                Save & Next →
              </button>
            </div>
          </div>
        </main>

        {/* Right Sidebar Column */}
        <aside className="space-y-4">
          {/* Student Profile Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-500/15 text-lg font-bold text-teal-700 border border-teal-500/20">
                👤
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-extrabold uppercase text-slate-400 tracking-wider">Candidate</p>
                <p className="text-sm font-bold text-slate-900 truncate">Student Portal</p>
              </div>
            </div>
          </div>

          {/* Question Palette Grid Navigator */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Question Palette</p>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                {attempt.attemptQuestions.length} Questions
              </span>
            </div>

            <div className="max-h-64 overflow-y-auto p-1.5">
              <div className="grid grid-cols-5 gap-2.5">
                {attempt.attemptQuestions.map((q, index) => {
                  const category = getQuestionCategory(q.question, questionStates[q.id]);
                  const isCurrent = currentQuestionIndex === index;

                  let styleClass = "";
                  if (category === "ATTEMPTED") {
                    styleClass = "bg-emerald-600 border-emerald-700 text-white font-bold";
                  } else if (category === "NOT_ATTEMPTED") {
                    styleClass = "bg-rose-500 border-rose-600 text-white font-bold";
                  } else if (category === "ATTEMPTED_AND_REVIEW") {
                    styleClass = "bg-purple-600 border-purple-700 text-white font-bold ring-2 ring-purple-300";
                  } else if (category === "NOT_ATTEMPTED_AND_REVIEW") {
                    styleClass = "bg-amber-500 border-amber-600 text-white font-bold ring-2 ring-amber-300";
                  } else {
                    styleClass = "bg-slate-100 border-slate-300 text-slate-600 hover:bg-white";
                  }

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => goToQuestion(index)}
                      className={`relative flex h-9 items-center justify-center rounded-xl border text-xs transition ${styleClass} ${
                        isCurrent ? "ring-2 ring-offset-1 ring-slate-900 scale-105 z-10" : ""
                      }`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Overall Summary Box */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Overall Summary</h3>

            <div className="grid grid-cols-1 gap-2 text-xs">
              {/* Attempted */}
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-2.5 border border-emerald-200">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-emerald-600"></span>
                  <span className="font-semibold text-emerald-950">Attempted</span>
                </div>
                <span className="font-bold text-emerald-900 bg-white px-2 py-0.5 rounded-md border border-emerald-200/60 shadow-2xs">
                  {summaryCounts.attempted}
                </span>
              </div>

              {/* Not Attempted */}
              <div className="flex items-center justify-between rounded-xl bg-rose-50 p-2.5 border border-rose-200">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-500"></span>
                  <span className="font-semibold text-rose-950">Not Attempted</span>
                </div>
                <span className="font-bold text-rose-900 bg-white px-2 py-0.5 rounded-md border border-rose-200/60 shadow-2xs">
                  {summaryCounts.notAttempted}
                </span>
              </div>

              {/* Attempted & Review */}
              <div className="flex items-center justify-between rounded-xl bg-purple-50 p-2.5 border border-purple-200">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-purple-600"></span>
                  <span className="font-semibold text-purple-950">Attempted & Review</span>
                </div>
                <span className="font-bold text-purple-900 bg-white px-2 py-0.5 rounded-md border border-purple-200/60 shadow-2xs">
                  {summaryCounts.attemptedReview}
                </span>
              </div>

              {/* Not Attempted & Review */}
              <div className="flex items-center justify-between rounded-xl bg-amber-50 p-2.5 border border-amber-200">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-amber-500"></span>
                  <span className="font-semibold text-amber-950">Not Attempted & Review</span>
                </div>
                <span className="font-bold text-amber-900 bg-white px-2 py-0.5 rounded-md border border-amber-200/60 shadow-2xs">
                  {summaryCounts.notAttemptedReview}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 text-xs text-slate-500 border-t border-slate-100 font-medium">
              <span>Not Visited: <strong className="text-slate-800">{summaryCounts.notVisited}</strong></span>
              <span>Total Qs: <strong className="text-slate-800">{attempt.attemptQuestions.length}</strong></span>
            </div>
          </div>
        </aside>
      </div>

      {/* In-Place Image Zoom Modal Overlay (No Tab Switching!) */}
      {zoomImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm transition-all"
          onClick={() => setZoomImageUrl(null)}
        >
          <div
            className="relative max-h-[92vh] max-w-5xl overflow-auto rounded-3xl bg-white p-3 shadow-2xl border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoomImageUrl(null)}
              className="absolute top-4 right-4 z-10 rounded-full bg-slate-900/80 p-2 text-white hover:bg-slate-900 transition shadow-lg"
              title="Close enlarged preview"
            >
              <span className="flex h-5 w-5 items-center justify-center font-bold text-lg leading-none">×</span>
            </button>
            <img
              src={zoomImageUrl}
              alt="Question Preview Enlarged"
              className="max-h-[85vh] w-auto max-w-full rounded-2xl object-contain bg-white"
            />
          </div>
        </div>
      )}

      {/* Time Up Submitting Modal */}
      {timesUpSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 text-center">
          <div className="rounded-2xl border border-rose-300/40 bg-rose-900/30 px-6 py-5">
            <p className="text-lg font-semibold text-rose-100">Time's up - submitting...</p>
          </div>
        </div>
      )}
    </div>
  );
}
