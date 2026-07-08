"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { getApiErrorMessage } from "@/lib/apiError";
import { getModules, type ModuleRecord } from "@/lib/api/modules";
import { getQuestionBanks, type QuestionBankRecord } from "@/lib/api/questionbanks";
import { getSubjects, type SubjectRecord } from "@/lib/api/subjects";
import { createTest } from "@/lib/api/tests";

type StepId = 1 | 2 | 3 | 4;

type TreeNode = {
  subject: SubjectRecord;
  modules: Array<{
    module: ModuleRecord;
    banks: QuestionBankRecord[];
  }>;
};

type SelectedRule = {
  qbId: string;
  qbName: string;
  moduleName: string;
  subjectName: string;
  totalQuestions: number;
  questionsToPickInput: string;
  marksPerQuestionInput: string;
  randomQuestions: boolean;
  randomOrder: boolean;
  uniqueQuestions: boolean;
  shuffleOptions: boolean;
};

type BasicValidation = {
  title?: string;
  enrollmentKey?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: string;
};

function parseLocalDateTime(value: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toPositiveInteger(value: string): number | null {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

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

function StepIndicator({ step }: { step: StepId }) {
  const items = [
    { id: 1 as const, label: "Basic Info" },
    { id: 2 as const, label: "Test Settings" },
    { id: 3 as const, label: "Question Banks" },
    { id: 4 as const, label: "Review" }
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <ol className="grid gap-3 sm:grid-cols-4">
        {items.map((item) => {
          const active = step === item.id;
          const complete = step > item.id;

          return (
            <li
              key={item.id}
              className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                active
                  ? "border-[var(--primary)] bg-teal-50 text-teal-900"
                  : complete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              Step {item.id}: {item.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function CreateTestPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [step, setStep] = useState<StepId>(1);
  const [showEnrollmentKey, setShowEnrollmentKey] = useState(false);
  const [requireEnrollmentKey, setRequireEnrollmentKey] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [startTimeInput, setStartTimeInput] = useState("");
  const [endTimeInput, setEndTimeInput] = useState("");
  const [durationMinutesInput, setDurationMinutesInput] = useState("60");
  const [minDateTime, setMinDateTime] = useState("");
  
  // Proctoring Settings States
  const [useFullscreen, setUseFullscreen] = useState(false);
  const [logActivities, setLogActivities] = useState(false);
  const [preventCopyPaste, setPreventCopyPaste] = useState(false);

  // Behavioral Settings States
  const [saveAttempts, setSaveAttempts] = useState(true);
  const [infiniteTries, setInfiniteTries] = useState(false);
  const [resultsReveal, setResultsReveal] = useState(true);

  const [globalRulesEnabled, setGlobalRulesEnabled] = useState(false);
  const [globalRules, setGlobalRules] = useState({
    randomQuestions: true,
    randomOrder: true,
    uniqueQuestions: false,
    shuffleOptions: false
  });

  useEffect(() => {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    
    const localNow = new Date(now.getTime() - offsetMs);
    const localNowStr = localNow.toISOString().slice(0, 16);
    
    setMinDateTime(localNowStr);
    setStartTimeInput(localNowStr);

    const minEnd = new Date(now.getTime() + 60 * 60000);
    const localMinEnd = new Date(minEnd.getTime() - offsetMs);
    setEndTimeInput(localMinEnd.toISOString().slice(0, 16));
  }, []);

  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);

  const [selectedRules, setSelectedRules] = useState<Record<string, SelectedRule>>({});

  const step1Validation = useMemo<Record<string, string>>(() => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = "Title is required.";
    } else if (title.trim().length > 200) {
      errors.title = "Title must be at most 200 characters.";
    }

    const startDate = parseLocalDateTime(startTimeInput);
    const endDate = parseLocalDateTime(endTimeInput);

    if (!startDate) {
      errors.startTime = "Start time is required.";
    }
    if (!endDate) {
      errors.endTime = "End time is required.";
    }
    if (startDate && endDate && endDate <= startDate) {
      errors.endTime = "End time must be after start time.";
    }

    return errors;
  }, [endTimeInput, startTimeInput, title]);

  const step1Valid = useMemo(() => Object.keys(step1Validation).length === 0, [step1Validation]);

  const step2Validation = useMemo<Record<string, string>>(() => {
    const errors: Record<string, string> = {};

    if (requireEnrollmentKey) {
      if (!enrollmentKey.trim()) {
        errors.enrollmentKey = "Enrollment key is required.";
      } else if (/\s/.test(enrollmentKey)) {
        errors.enrollmentKey = "Enrollment key cannot contain spaces.";
      } else if (enrollmentKey.length < 4 || enrollmentKey.length > 50) {
        errors.enrollmentKey = "Enrollment key must be between 4 and 50 characters.";
      }
    }

    const duration = toPositiveInteger(durationMinutesInput);
    if (!duration) {
      errors.durationMinutes = "Duration must be a positive integer.";
    }

    const startDate = parseLocalDateTime(startTimeInput);
    const endDate = parseLocalDateTime(endTimeInput);

    if (startDate && endDate && duration) {
      const gapMinutes = Math.floor((endDate.getTime() - startDate.getTime()) / 60000);
      if (duration > gapMinutes) {
        errors.durationMinutes = `Duration must be at most ${gapMinutes} minutes.`;
      }
    }

    return errors;
  }, [requireEnrollmentKey, enrollmentKey, durationMinutesInput, startTimeInput, endTimeInput]);

  const step2Valid = useMemo(() => Object.keys(step2Validation).length === 0, [step2Validation]);

  const basicValidation = useMemo<BasicValidation>(() => {
    return { ...step1Validation, ...step2Validation };
  }, [step1Validation, step2Validation]);

  const basicStepValid = useMemo(() => step1Valid && step2Valid, [step1Valid, step2Valid]);

  const startDate = useMemo(() => parseLocalDateTime(startTimeInput), [startTimeInput]);
  const endDate = useMemo(() => parseLocalDateTime(endTimeInput), [endTimeInput]);

  const gapMinutes = useMemo(() => {
    if (!startDate || !endDate || endDate <= startDate) {
      return null;
    }

    return Math.floor((endDate.getTime() - startDate.getTime()) / 60000);
  }, [endDate, startDate]);

  const selectedRulesList = useMemo(
    () => Object.values(selectedRules),
    [selectedRules]
  );

  const ruleValidationErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    for (const rule of selectedRulesList) {
      const pick = toPositiveInteger(rule.questionsToPickInput);
      const marks = toPositiveInteger(rule.marksPerQuestionInput);

      if (!pick) {
        errors[rule.qbId] = "Pick value must be a positive integer.";
        continue;
      }

      if (pick > rule.totalQuestions) {
        errors[rule.qbId] = `Cannot pick more than ${rule.totalQuestions} questions.`;
        continue;
      }

      if (!marks) {
        errors[rule.qbId] = "Marks per question must be a positive integer.";
      }
    }

    return errors;
  }, [selectedRulesList]);

  const totalMarks = useMemo(() => {
    return selectedRulesList.reduce((sum, rule) => {
      const pick = toPositiveInteger(rule.questionsToPickInput);
      const marks = toPositiveInteger(rule.marksPerQuestionInput);

      if (!pick || !marks) {
        return sum;
      }

      return sum + pick * marks;
    }, 0);
  }, [selectedRulesList]);

  const qbSelectionValid =
    selectedRulesList.length > 0 && Object.keys(ruleValidationErrors).length === 0;

  useEffect(() => {
    const loadTree = async () => {
      setTreeLoading(true);
      setTreeError(null);

      try {
        const subjects = await getSubjects();

        const modulesPerSubject = await Promise.all(
          subjects.map(async (subject) => ({
            subject,
            modules: await getModules(subject.id)
          }))
        );

        const structured = await Promise.all(
          modulesPerSubject.map(async ({ subject, modules }) => {
            const modulesWithBanks = await Promise.all(
              modules.map(async (module) => ({
                module,
                banks: await getQuestionBanks(module.id)
              }))
            );

            return {
              subject,
              modules: modulesWithBanks
            };
          })
        );

        setTree(structured);
      } catch {
        setTreeError("Unable to load subject/module/question bank tree.");
      } finally {
        setTreeLoading(false);
      }
    };

    void loadTree();
  }, []);

  const toggleRule = (
    qb: QuestionBankRecord,
    module: ModuleRecord,
    subject: SubjectRecord,
    checked: boolean
  ) => {
    setSelectedRules((current) => {
      const next = { ...current };

      if (checked) {
        next[qb.id] = {
          qbId: qb.id,
          qbName: qb.name,
          moduleName: module.name,
          subjectName: subject.name,
          totalQuestions: qb._count?.questions ?? 0,
          questionsToPickInput: "1",
          marksPerQuestionInput: "1",
          randomQuestions: true,
          randomOrder: true,
          uniqueQuestions: false,
          shuffleOptions: false
        };
      } else {
        delete next[qb.id];
      }

      return next;
    });
  };

  const updateRule = (qbId: string, patch: Partial<SelectedRule>) => {
    setSelectedRules((current) => {
      const existing = current[qbId];

      if (!existing) {
        return current;
      }

      return {
        ...current,
        [qbId]: {
          ...existing,
          ...patch
        }
      };
    });
  };

  const submitCreate = async () => {
    if (!basicStepValid || !qbSelectionValid || !startDate || !endDate) {
      showToast("Please fix all validation errors before creating the test.", "error");
      return;
    }

    const duration = toPositiveInteger(durationMinutesInput);

    if (!duration) {
      showToast("Duration must be a positive integer.", "error");
      return;
    }

    const qbRules = selectedRulesList.map((rule) => ({
      qbId: rule.qbId,
      questionsToPick: toPositiveInteger(rule.questionsToPickInput) ?? 0,
      marksPerQuestion: toPositiveInteger(rule.marksPerQuestionInput) ?? 0,
      randomQuestions: globalRulesEnabled ? globalRules.randomQuestions : rule.randomQuestions,
      randomOrder: globalRulesEnabled ? globalRules.randomOrder : rule.randomOrder,
      uniqueQuestions: globalRulesEnabled ? globalRules.uniqueQuestions : rule.uniqueQuestions,
      shuffleOptions: globalRulesEnabled ? globalRules.shuffleOptions : rule.shuffleOptions
    }));

    try {
      setSubmitting(true);

      await createTest({
        title: title.trim(),
        enrollmentKey: requireEnrollmentKey ? enrollmentKey.trim() : null,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        durationMinutes: duration,
        useFullscreen,
        logActivities,
        preventCopyPaste,
        saveAttempts,
        infiniteTries,
        resultsReveal,
        qbRules
      });

      showToast("Test created successfully");
      router.push("/dashboard/tests?created=1");
    } catch (apiError: any) {
      showToast(getApiErrorMessage(apiError, "Failed to create test"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          <Link href="/dashboard/tests" className="font-medium text-[var(--primary)] hover:underline">
            Tests
          </Link>{" "}
          <span className="px-1 text-slate-300">&gt;</span>
          <span className="font-medium text-slate-900">Create Test</span>
        </p>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Create Test</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">New test setup</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Complete the steps to create and schedule your test.
          </p>
        </div>
      </div>

      <StepIndicator step={step} />

      {step === 1 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Step 1 — Basic Info</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 space-y-1.5">
              <label htmlFor="title" className="text-sm font-medium text-slate-700">
                Title
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              />
              {step1Validation.title ? <p className="text-xs text-rose-600">{step1Validation.title}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="startTime" className="text-sm font-medium text-slate-700">
                Start Time
              </label>
              <input
                id="startTime"
                type="datetime-local"
                min={minDateTime}
                value={startTimeInput}
                onChange={(event) => {
                  const newStartStr = event.target.value;
                  setStartTimeInput(newStartStr);
                  if (newStartStr) {
                    const start = new Date(newStartStr);
                    if (!isNaN(start.getTime())) {
                      const duration = toPositiveInteger(durationMinutesInput) || 60;
                      const end = new Date(start.getTime() + duration * 60000);
                      const offsetMs = end.getTimezoneOffset() * 60000;
                      const localEnd = new Date(end.getTime() - offsetMs);
                      setEndTimeInput(localEnd.toISOString().slice(0, 16));
                    }
                  }
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              />
              {step1Validation.startTime ? <p className="text-xs text-rose-600">{step1Validation.startTime}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="endTime" className="text-sm font-medium text-slate-700">
                End Time
              </label>
              <input
                id="endTime"
                type="datetime-local"
                min={minDateTime}
                value={endTimeInput}
                onChange={(event) => setEndTimeInput(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              />
              {step1Validation.endTime ? <p className="text-xs text-rose-600">{step1Validation.endTime}</p> : null}
            </div>

            <div className="md:col-span-2">
              <p className="text-xs text-slate-500">
                {gapMinutes === null
                  ? "Set valid start and end times to see available test window."
                  : `Available test window: ${gapMinutes} minutes`}
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!step1Valid}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Step 2 — Test Settings & Proctoring</h2>

          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">General settings</h3>
              
              <div className="space-y-1.5">
                <label htmlFor="duration" className="text-sm font-medium text-slate-700">
                  Duration in minutes
                </label>
                <input
                  id="duration"
                  type="number"
                  min={1}
                  value={durationMinutesInput}
                  onChange={(event) => {
                    const newDurationStr = event.target.value;
                    setDurationMinutesInput(newDurationStr);
                    const duration = toPositiveInteger(newDurationStr);
                    if (duration && startTimeInput) {
                      const start = new Date(startTimeInput);
                      if (!isNaN(start.getTime())) {
                        const end = new Date(start.getTime() + duration * 60000);
                        const offsetMs = end.getTimezoneOffset() * 60000;
                        const localEnd = new Date(end.getTime() - offsetMs);
                        setEndTimeInput(localEnd.toISOString().slice(0, 16));
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
                />
                {step2Validation.durationMinutes ? (
                  <p className="text-xs text-rose-600">{step2Validation.durationMinutes}</p>
                ) : null}
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireEnrollmentKey}
                    onChange={(e) => setRequireEnrollmentKey(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                  />
                  <span>Require Enrollment Key for students to join this test</span>
                </label>

                {requireEnrollmentKey && (
                  <div className="space-y-1.5 pl-6">
                    <label htmlFor="enrollmentKey" className="text-sm font-medium text-slate-700">
                      Enrollment Key
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="enrollmentKey"
                        type={showEnrollmentKey ? "text" : "password"}
                        value={enrollmentKey}
                        onChange={(event) => setEnrollmentKey(event.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEnrollmentKey((value) => !value)}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        {showEnrollmentKey ? "Hide" : "Show"}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">Use a key without spaces.</p>
                    {step2Validation.enrollmentKey ? (
                      <p className="text-xs text-rose-600">{step2Validation.enrollmentKey}</p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Security & Proctoring</h3>
              
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useFullscreen}
                      onChange={(e) => setUseFullscreen(e.target.checked)}
                      className="h-5 w-5 mt-0.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">Force & Lock Fullscreen Mode</span>
                      <span className="text-xs text-slate-500 block mt-1">
                        Forces the student browser into fullscreen mode to take the exam. Student will be blocked if they exit fullscreen.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={logActivities}
                      onChange={(e) => setLogActivities(e.target.checked)}
                      className="h-5 w-5 mt-0.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">Enable Proctoring Activity Logging</span>
                      <span className="text-xs text-slate-500 block mt-1">
                        Logs proctoring violations such as tab-switching (Alt+Tab), loss of window focus, copy-paste shortcuts, and right-clicks.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preventCopyPaste}
                      onChange={(e) => setPreventCopyPaste(e.target.checked)}
                      className="h-5 w-5 mt-0.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">Strict Copy-Paste & Right-Click Lock</span>
                      <span className="text-xs text-slate-500 block mt-1">
                        Blocks right-click context menus, and copy, cut, and paste keyboard shortcuts inside the test window.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mt-6 block">Behavior & Results</h3>
              
              <div className="space-y-3 mt-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveAttempts}
                      onChange={(e) => setSaveAttempts(e.target.checked)}
                      className="h-5 w-5 mt-0.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">Save Attempts History (Storage)</span>
                      <span className="text-xs text-slate-500 block mt-1">
                        Saves student attempts and grades in the database. Disable to make it a practice test where results are deleted immediately on submission.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={infiniteTries}
                      onChange={(e) => setInfiniteTries(e.target.checked)}
                      className="h-5 w-5 mt-0.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">Allow Infinite Attempts (Tries)</span>
                      <span className="text-xs text-slate-500 block mt-1">
                        Allows students to take the exam multiple times. All past attempt histories are stored and viewable.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resultsReveal}
                      onChange={(e) => setResultsReveal(e.target.checked)}
                      className="h-5 w-5 mt-0.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-900 block">Reveal Results to Students</span>
                      <span className="text-xs text-slate-500 block mt-1">
                        Allows students to view their detailed questions, selected answers, and correct answers after submitting the exam.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!step2Valid}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Step 3 — Select Question Banks</h2>

          {treeError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {treeError}
            </div>
          ) : null}

          {/* Global Rules Panel */}
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={globalRulesEnabled}
                onChange={(event) => setGlobalRulesEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
              />
              <span>Apply Global Settings to All Selected Question Banks</span>
            </label>
            <p className="mt-1 text-xs text-slate-500 pl-7">
              When enabled, these randomization and shuffling settings will override individual question bank options.
            </p>

            <div className={`mt-4 pl-7 grid gap-4 sm:grid-cols-2 md:grid-cols-4 transition-all duration-200 ${globalRulesEnabled ? "opacity-100 pointer-events-auto" : "opacity-40 pointer-events-none"}`}>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!globalRulesEnabled}
                  checked={globalRules.randomQuestions}
                  onChange={(event) =>
                    setGlobalRules((prev) => ({ ...prev, randomQuestions: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                />
                <span>Random Questions</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!globalRulesEnabled}
                  checked={globalRules.randomOrder}
                  onChange={(event) =>
                    setGlobalRules((prev) => ({ ...prev, randomOrder: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                />
                <span>Random Order</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!globalRulesEnabled}
                  checked={globalRules.uniqueQuestions}
                  onChange={(event) =>
                    setGlobalRules((prev) => ({ ...prev, uniqueQuestions: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                />
                <span>Unique Questions per Student</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!globalRulesEnabled}
                  checked={globalRules.shuffleOptions}
                  onChange={(event) =>
                    setGlobalRules((prev) => ({ ...prev, shuffleOptions: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                />
                <span>Shuffle Options</span>
              </label>
            </div>
          </div>

          {treeLoading ? (
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {tree.map((subjectNode) => (
                <div key={subjectNode.subject.id} className="rounded-2xl border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
                    {subjectNode.subject.name}
                  </h3>

                  <div className="mt-3 space-y-3">
                    {subjectNode.modules.map(({ module, banks }) => (
                      <div key={module.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-semibold text-slate-900">{module.name}</p>

                        {banks.length === 0 ? (
                          <p className="mt-2 text-xs text-slate-500">No question banks in this module.</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {banks.map((bank) => {
                              const selected = selectedRules[bank.id];
                              const ruleError = ruleValidationErrors[bank.id];

                              return (
                                <div key={bank.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                  <label className="flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-2 text-sm text-slate-900">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(selected)}
                                        onChange={(event) =>
                                          toggleRule(bank, module, subjectNode.subject, event.target.checked)
                                        }
                                        className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)]"
                                      />
                                      <span className="font-medium">{bank.name}</span>
                                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                        bank.type === "easy"
                                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                                          : bank.type === "medium"
                                          ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20"
                                          : bank.type === "complex"
                                          ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20"
                                          : "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20"
                                      }`}>
                                        {bank.type}
                                      </span>
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      {bank._count?.questions ?? 0} questions
                                    </span>
                                  </label>

                                  {selected ? (
                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                          Pick
                                        </label>
                                        <div className="mt-1 flex items-center gap-2 text-sm">
                                          <input
                                            type="number"
                                            min={1}
                                            max={selected.totalQuestions}
                                            value={selected.questionsToPickInput}
                                            onChange={(event) =>
                                              updateRule(bank.id, {
                                                questionsToPickInput: event.target.value
                                              })
                                            }
                                            className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
                                          />
                                          <span className="text-slate-600">
                                            out of {selected.totalQuestions} questions
                                          </span>
                                        </div>
                                      </div>

                                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                          Marks per question
                                        </label>
                                        <div className="mt-1">
                                          <input
                                            type="number"
                                            min={1}
                                            value={selected.marksPerQuestionInput}
                                            onChange={(event) =>
                                              updateRule(bank.id, {
                                                marksPerQuestionInput: event.target.value
                                              })
                                            }
                                            className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
                                          />
                                        </div>
                                      </div>

                                      <div className="md:col-span-2 flex flex-wrap items-center gap-4 mt-1 border-t border-slate-100 pt-3">
                                        <label className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700 ${globalRulesEnabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                                          <input
                                            type="checkbox"
                                            disabled={globalRulesEnabled}
                                            checked={globalRulesEnabled ? globalRules.randomQuestions : selected.randomQuestions}
                                            onChange={(event) =>
                                              updateRule(bank.id, {
                                                randomQuestions: event.target.checked
                                              })
                                            }
                                            className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)] disabled:opacity-50"
                                          />
                                          <span>Random Questions</span>
                                        </label>
                                        <label className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700 ${globalRulesEnabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                                          <input
                                            type="checkbox"
                                            disabled={globalRulesEnabled}
                                            checked={globalRulesEnabled ? globalRules.randomOrder : selected.randomOrder}
                                            onChange={(event) =>
                                              updateRule(bank.id, {
                                                randomOrder: event.target.checked
                                              })
                                            }
                                            className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)] disabled:opacity-50"
                                          />
                                          <span>Random Order</span>
                                        </label>
                                        <label className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700 ${globalRulesEnabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                                          <input
                                            type="checkbox"
                                            disabled={globalRulesEnabled}
                                            checked={globalRulesEnabled ? globalRules.uniqueQuestions : selected.uniqueQuestions}
                                            onChange={(event) =>
                                              updateRule(bank.id, {
                                                uniqueQuestions: event.target.checked
                                              })
                                            }
                                            className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)] disabled:opacity-50"
                                          />
                                          <span>Unique Questions per Student</span>
                                        </label>
                                        <label className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700 ${globalRulesEnabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                                          <input
                                            type="checkbox"
                                            disabled={globalRulesEnabled}
                                            checked={globalRulesEnabled ? globalRules.shuffleOptions : selected.shuffleOptions}
                                            onChange={(event) =>
                                              updateRule(bank.id, {
                                                shuffleOptions: event.target.checked
                                              })
                                            }
                                            className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--ring)] disabled:opacity-50"
                                          />
                                          <span>Shuffle Options</span>
                                        </label>
                                        {globalRulesEnabled && (
                                          <span className="text-[10px] text-teal-600 font-semibold uppercase tracking-[0.05em] ml-auto">
                                            Overridden by global rules
                                          </span>
                                        )}
                                      </div>

                                      {ruleError ? (
                                        <p className="md:col-span-2 text-xs text-rose-600">{ruleError}</p>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Total marks: {totalMarks}</span>
          </div>

          {selectedRulesList.length === 0 ? (
            <p className="mt-2 text-xs text-rose-600">Select at least one question bank.</p>
          ) : null}

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              disabled={!qbSelectionValid}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Step 4 — Review & Confirm</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Basic info</h3>
              <dl className="mt-2 grid gap-2 text-sm text-slate-700">
                <div>
                  <dt className="font-medium text-slate-900">Title</dt>
                  <dd>{title.trim()}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-900">Start</dt>
                  <dd>{startDate ? formatDateTime(startDate.toISOString()) : "-"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-900">End</dt>
                  <dd>{endDate ? formatDateTime(endDate.toISOString()) : "-"}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Settings & Proctoring</h3>
              <dl className="mt-2 grid gap-2 text-sm text-slate-700">
                <div>
                  <dt className="font-medium text-slate-900">Duration</dt>
                  <dd>{durationMinutesInput} min</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-900">Enrollment Key</dt>
                  <dd>{requireEnrollmentKey ? enrollmentKey.trim() : "None (optional)"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-900">Proctoring status</dt>
                  <dd className="space-y-1.5 mt-1 text-xs font-semibold">
                    {useFullscreen && (
                      <span className="inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-teal-800 border border-teal-200 mr-2">
                        Lock Fullscreen
                      </span>
                    )}
                    {logActivities && (
                      <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-800 border border-indigo-200 mr-2">
                        Activity Logging
                      </span>
                    )}
                    {preventCopyPaste && (
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 border border-amber-200">
                        Copy-Paste Disabled
                      </span>
                    )}
                    {!useFullscreen && !logActivities && !preventCopyPaste && (
                      <span className="text-slate-500 font-medium normal-case">Standard Mode (None)</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-900 mt-2">Test Behavior</dt>
                  <dd className="space-y-1.5 mt-1 text-xs font-semibold">
                    <span className={`inline-flex rounded-full px-2 py-0.5 border ${saveAttempts ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-800 border-rose-200"} mr-2`}>
                      {saveAttempts ? "Save Attempts (Storage On)" : "Don't Save Attempts (Storage Off)"}
                    </span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 border ${infiniteTries ? "bg-purple-50 text-purple-800 border-purple-200" : "bg-slate-100 text-slate-600 border-slate-200"} mr-2`}>
                      {infiniteTries ? "Infinite Attempts" : "Single Attempt Limit"}
                    </span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 border ${resultsReveal ? "bg-blue-50 text-blue-800 border-blue-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>
                      {resultsReveal ? "Reveal Correct Answers" : "Hide Correct Answers"}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Question Bank</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pick</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Marks/Q</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {selectedRulesList.map((rule) => {
                  const pick = toPositiveInteger(rule.questionsToPickInput) ?? 0;
                  const marks = toPositiveInteger(rule.marksPerQuestionInput) ?? 0;
                  const randomQuestions = globalRulesEnabled ? globalRules.randomQuestions : rule.randomQuestions;
                  const randomOrder = globalRulesEnabled ? globalRules.randomOrder : rule.randomOrder;
                  const uniqueQuestions = globalRulesEnabled ? globalRules.uniqueQuestions : rule.uniqueQuestions;
                  const shuffleOptions = globalRulesEnabled ? globalRules.shuffleOptions : rule.shuffleOptions;

                  return (
                    <tr key={rule.qbId}>
                      <td className="px-4 py-3 text-sm text-slate-900">
                        <p className="font-medium">{rule.qbName}</p>
                        <p className="text-xs text-slate-500">
                          {rule.subjectName} / {rule.moduleName}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${randomQuestions ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                            {randomQuestions ? "Random Selection" : "Ordered Selection"}
                          </span>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${randomOrder ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                            {randomOrder ? "Random Order" : "Default Order"}
                          </span>
                          {uniqueQuestions && (
                            <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                              Unique per Student
                            </span>
                          )}
                          {shuffleOptions && (
                            <span className="inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                              Shuffle Options
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{pick}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{marks}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">{pick * marks}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Total marks: {totalMarks}</span>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void submitCreate()}
              disabled={submitting || !basicStepValid || !qbSelectionValid}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : null}
              {submitting ? "Creating..." : "Create Test"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
