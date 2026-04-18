"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { getModules, type ModuleRecord } from "@/lib/api/modules";
import { getQuestionBanks, type QuestionBankRecord } from "@/lib/api/questionbanks";
import { getSubjects, type SubjectRecord } from "@/lib/api/subjects";
import { createTest } from "@/lib/api/tests";

type StepId = 1 | 2 | 3;

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
    { id: 2 as const, label: "Question Banks" },
    { id: 3 as const, label: "Review" }
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <ol className="grid gap-3 sm:grid-cols-3">
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
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [startTimeInput, setStartTimeInput] = useState("");
  const [endTimeInput, setEndTimeInput] = useState("");
  const [durationMinutesInput, setDurationMinutesInput] = useState("");

  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);

  const [selectedRules, setSelectedRules] = useState<Record<string, SelectedRule>>({});

  const basicValidation = useMemo<BasicValidation>(() => {
    const errors: BasicValidation = {};

    if (!title.trim()) {
      errors.title = "Title is required.";
    } else if (title.trim().length > 200) {
      errors.title = "Title must be at most 200 characters.";
    }

    if (!enrollmentKey.trim()) {
      errors.enrollmentKey = "Enrollment key is required.";
    } else if (/\s/.test(enrollmentKey)) {
      errors.enrollmentKey = "Enrollment key cannot contain spaces.";
    } else if (enrollmentKey.length < 4 || enrollmentKey.length > 50) {
      errors.enrollmentKey = "Enrollment key must be between 4 and 50 characters.";
    }

    const startDate = parseLocalDateTime(startTimeInput);
    const endDate = parseLocalDateTime(endTimeInput);
    const duration = toPositiveInteger(durationMinutesInput);

    if (!startDate) {
      errors.startTime = "Start time is required.";
    }

    if (!endDate) {
      errors.endTime = "End time is required.";
    }

    if (!duration) {
      errors.durationMinutes = "Duration must be a positive integer.";
    }

    if (startDate && endDate) {
      if (endDate <= startDate) {
        errors.endTime = "End time must be after start time.";
      }

      const gapMinutes = Math.floor((endDate.getTime() - startDate.getTime()) / 60000);

      if (duration && duration > gapMinutes) {
        errors.durationMinutes = `Duration must be at most ${gapMinutes} minutes.`;
      }
    }

    return errors;
  }, [durationMinutesInput, enrollmentKey, endTimeInput, startTimeInput, title]);

  const startDate = useMemo(() => parseLocalDateTime(startTimeInput), [startTimeInput]);
  const endDate = useMemo(() => parseLocalDateTime(endTimeInput), [endTimeInput]);

  const gapMinutes = useMemo(() => {
    if (!startDate || !endDate || endDate <= startDate) {
      return null;
    }

    return Math.floor((endDate.getTime() - startDate.getTime()) / 60000);
  }, [endDate, startDate]);

  const basicStepValid = useMemo(
    () => Object.keys(basicValidation).length === 0,
    [basicValidation]
  );

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
          totalQuestions: qb._count.questions,
          questionsToPickInput: "1",
          marksPerQuestionInput: "1"
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
      marksPerQuestion: toPositiveInteger(rule.marksPerQuestionInput) ?? 0
    }));

    try {
      setSubmitting(true);

      await createTest({
        title: title.trim(),
        enrollmentKey: enrollmentKey.trim(),
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        durationMinutes: duration,
        qbRules
      });

      showToast("Test created successfully");
      router.push("/dashboard/tests?created=1");
    } catch (apiError: any) {
      showToast(apiError?.response?.data?.message ?? "Failed to create test", "error");
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
            Complete the three steps to create and schedule your test.
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
              {basicValidation.title ? <p className="text-xs text-rose-600">{basicValidation.title}</p> : null}
            </div>

            <div className="space-y-1.5">
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
              {basicValidation.enrollmentKey ? (
                <p className="text-xs text-rose-600">{basicValidation.enrollmentKey}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="duration" className="text-sm font-medium text-slate-700">
                Duration in minutes
              </label>
              <input
                id="duration"
                type="number"
                min={1}
                value={durationMinutesInput}
                onChange={(event) => setDurationMinutesInput(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              />
              {basicValidation.durationMinutes ? (
                <p className="text-xs text-rose-600">{basicValidation.durationMinutes}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="startTime" className="text-sm font-medium text-slate-700">
                Start Time
              </label>
              <input
                id="startTime"
                type="datetime-local"
                value={startTimeInput}
                onChange={(event) => setStartTimeInput(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              />
              {basicValidation.startTime ? <p className="text-xs text-rose-600">{basicValidation.startTime}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="endTime" className="text-sm font-medium text-slate-700">
                End Time
              </label>
              <input
                id="endTime"
                type="datetime-local"
                value={endTimeInput}
                onChange={(event) => setEndTimeInput(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              />
              {basicValidation.endTime ? <p className="text-xs text-rose-600">{basicValidation.endTime}</p> : null}
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
              disabled={!basicStepValid}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Step 2 — Select Question Banks</h2>

          {treeError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {treeError}
            </div>
          ) : null}

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
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      {bank._count.questions} questions
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
              onClick={() => setStep(1)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!qbSelectionValid}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Step 3 — Review & Confirm</h2>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Basic info</h3>
            <dl className="mt-2 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-900">Title</dt>
                <dd>{title.trim()}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-900">Enrollment Key</dt>
                <dd>{enrollmentKey.trim()}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-900">Start</dt>
                <dd>{startDate ? formatDateTime(startDate.toISOString()) : "-"}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-900">End</dt>
                <dd>{endDate ? formatDateTime(endDate.toISOString()) : "-"}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-900">Duration</dt>
                <dd>{durationMinutesInput} min</dd>
              </div>
            </dl>
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

                  return (
                    <tr key={rule.qbId}>
                      <td className="px-4 py-3 text-sm text-slate-900">
                        <p className="font-medium">{rule.qbName}</p>
                        <p className="text-xs text-slate-500">
                          {rule.subjectName} / {rule.moduleName}
                        </p>
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
              onClick={() => setStep(2)}
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
