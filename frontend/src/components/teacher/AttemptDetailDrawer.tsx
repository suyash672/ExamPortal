"use client";

import { useEffect, useState } from "react";
import type { AttemptDetail } from "@/lib/api/results";
import { AttemptScoreCard } from "@/components/shared/AttemptScoreCard";

type AttemptDetailDrawerProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  attempt: AttemptDetail | null;
  onRefresh?: () => void;
  onToggleBlock?: (isBlocked: boolean) => void;
  onClose: () => void;
};

function formatMarks(value: number | null): string {
  return value === null ? "-" : String(value);
}

export function AttemptDetailDrawer({
  open,
  loading,
  error,
  attempt,
  onRefresh,
  onToggleBlock,
  onClose
}: AttemptDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"scorecard" | "review">("scorecard");

  useEffect(() => {
    if (open) {
      setActiveTab("scorecard");
    }
  }, [open]);

  return (
    <div
      className={`fixed inset-0 z-50 transition ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close attempt details"
        onClick={onClose}
        className={`absolute inset-0 backdrop-blur-sm transition ${
          open ? "bg-slate-950/40 opacity-100" : "bg-slate-950/0 opacity-0"
        }`}
      />

      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-2xl border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
                  Attempt Detail
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  {attempt?.student.name ?? "Loading..."}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{attempt?.student.email ?? ""}</p>
              </div>

              <div className="flex items-center gap-2">
                {attempt && onToggleBlock && (
                  <button
                    type="button"
                    onClick={() => onToggleBlock(!attempt.isBlocked)}
                    disabled={loading}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      attempt.isBlocked
                        ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-500"
                        : "bg-rose-600 text-white border-rose-700 hover:bg-rose-500"
                    }`}
                  >
                    {attempt.isBlocked ? "🔓 Unblock Student" : "🚫 Block Student"}
                  </button>
                )}
                {onRefresh && attempt && (
                  <button
                    type="button"
                    onClick={onRefresh}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    🔄 Refresh Live Logs
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Close drawer"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {error}
              </div>
            ) : !attempt ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                No attempt details found.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex border-b border-slate-200 mb-4 no-print">
                  <button
                    type="button"
                    onClick={() => setActiveTab("scorecard")}
                    className={`flex-1 py-3 text-sm font-semibold border-b-2 transition ${
                      activeTab === "scorecard"
                        ? "border-slate-900 text-slate-900"
                        : "border-transparent text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    📊 Score Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("review")}
                    className={`flex-1 py-3 text-sm font-semibold border-b-2 transition ${
                      activeTab === "review"
                        ? "border-slate-900 text-slate-900"
                        : "border-transparent text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    📝 Questions Review
                  </button>
                </div>

                {activeTab === "scorecard" ? (
                  <div className="space-y-6">
                    {/* Multi-Attempt Summary Card */}
                    {attempt.studentSummary && (
                      <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-teal-900">
                            🔄 Student Multi-Attempt Statistics
                          </span>
                          <span className="inline-flex rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800">
                            {attempt.studentSummary.totalAttemptsCount} Attempt(s)
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-xl border border-teal-200 bg-white p-3">
                            <p className="text-[10px] font-bold uppercase text-slate-500">🏆 Best Score</p>
                            <p className="text-xl font-extrabold text-teal-900 mt-0.5">
                              {attempt.studentSummary.bestScore} / {attempt.totalMarks}
                            </p>
                          </div>
                          <div className="rounded-xl border border-sky-200 bg-white p-3">
                            <p className="text-[10px] font-bold uppercase text-slate-500">📊 Average Score</p>
                            <p className="text-xl font-extrabold text-sky-900 mt-0.5">
                              {attempt.studentSummary.averageScore} / {attempt.totalMarks}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-[10px] font-bold uppercase text-slate-500">🎯 This Attempt</p>
                            <p className="text-xl font-extrabold text-slate-900 mt-0.5">
                              {attempt.score ?? 0} / {attempt.totalMarks}
                            </p>
                          </div>
                        </div>

                        {attempt.studentSummary.attemptsList.length > 1 && (
                          <div className="space-y-1.5 pt-1">
                            <p className="text-[11px] font-bold text-teal-950">Attempt History & Score Switcher:</p>
                            <div className="flex flex-wrap gap-2">
                              {attempt.studentSummary.attemptsList.map((att) => (
                                <button
                                  key={att.id}
                                  type="button"
                                  onClick={() => onRefresh && onRefresh()}
                                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                                    att.id === attempt.id
                                      ? "bg-teal-700 text-white border-teal-800 shadow-xs"
                                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                                  }`}
                                >
                                  Attempt #{att.attemptNumber}: {att.score ?? 0} marks
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tier 2: Module-Wise Performance */}
                    {attempt.moduleStats && attempt.moduleStats.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-700">📘 Student Module-Wise Breakdown</p>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="min-w-full divide-y divide-slate-200 text-xs">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-3 py-2 text-left font-bold text-slate-600">Module</th>
                                <th className="px-3 py-2 text-left font-bold text-slate-600">Score</th>
                                <th className="px-3 py-2 text-left font-bold text-slate-600">Accuracy</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {attempt.moduleStats.map((mod) => (
                                <tr key={mod.moduleId}>
                                  <td className="px-3 py-2 font-bold text-slate-900">{mod.moduleName}</td>
                                  <td className="px-3 py-2 font-semibold text-teal-800">{mod.earnedScore} / {mod.totalMarks}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-teal-500 rounded-full"
                                          style={{ width: `${Math.min(100, mod.accuracyPercent)}%` }}
                                        />
                                      </div>
                                      <span className="font-bold text-slate-700 text-[11px]">{mod.accuracyPercent}%</span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tier 3: Question Bank & Difficulty Breakdown */}
                    {attempt.bankStats && attempt.bankStats.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-700">🎯 Question Bank & Difficulty Breakdown</p>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="min-w-full divide-y divide-slate-200 text-xs">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-3 py-2 text-left font-bold text-slate-600">Question Bank</th>
                                <th className="px-3 py-2 text-left font-bold text-slate-600">Difficulty</th>
                                <th className="px-3 py-2 text-left font-bold text-slate-600">Score</th>
                                <th className="px-3 py-2 text-left font-bold text-slate-600">Accuracy</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {attempt.bankStats.map((bank) => (
                                <tr key={bank.qbId}>
                                  <td className="px-3 py-2 font-bold text-slate-900">{bank.qbName}</td>
                                  <td className="px-3 py-2">
                                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 capitalize">
                                      {bank.difficulty}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-semibold text-teal-800">{bank.earnedScore} / {bank.totalMarks}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-teal-500 rounded-full"
                                          style={{ width: `${Math.min(100, bank.accuracyPercent)}%` }}
                                        />
                                      </div>
                                      <span className="font-bold text-slate-700 text-[11px]">{bank.accuracyPercent}%</span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <AttemptScoreCard
                      scorecard={attempt.scorecard}
                      studentName={attempt.student.name}
                      studentEmail={attempt.student.email}
                      testTitle={attempt.testTitle}
                      score={attempt.score}
                      totalMarks={attempt.totalMarks}
                      startedAt={attempt.startedAt}
                      submittedAt={attempt.submittedAt}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm text-slate-600">
                        Score: <span className="font-semibold text-slate-900">{attempt.score ?? 0}</span> /{" "}
                        <span className="font-semibold text-slate-900">{attempt.totalMarks}</span>
                      </p>
                    </div>

                {attempt.activities && attempt.activities.length > 0 && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
                    <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-rose-800 flex items-center gap-1.5">
                      ⚠️ Proctoring Logs ({attempt.activities.length} alerts)
                    </h3>
                    <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
                      {attempt.activities.map((act, index) => {
                        const dateStr = new Intl.DateTimeFormat("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit"
                        }).format(new Date(act.timestamp));

                        let badgeColor = "bg-rose-100 text-rose-800 border-rose-200";
                        if (act.type === "FOCUS_LOSS") {
                          badgeColor = "bg-amber-100 text-amber-800 border-amber-200";
                        }

                        return (
                          <div key={index} className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm">
                            <div className="flex items-center justify-between">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 font-bold uppercase tracking-wider text-[9px] ${badgeColor}`}>
                                {act.type}
                              </span>
                              <span className="text-slate-400 font-medium">{dateStr}</span>
                            </div>
                            <p className="mt-1 text-slate-700 font-medium">{act.message}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {attempt.questions.map((item, index) => {
                  const selected = new Set(item.studentAnswer?.selectedOptionIds ?? []);
                  const isAttempted = !!(item.studentAnswer && (
                    item.question.type === "MCQ"
                      ? (item.studentAnswer.selectedOptionIds && item.studentAnswer.selectedOptionIds.length > 0)
                      : (item.studentAnswer.textAnswer && item.studentAnswer.textAnswer.trim() !== "")
                  ));

                  return (
                    <article key={item.attemptQuestionId} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Question {index + 1}
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">{item.question.text}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isAttempted && (
                            <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                              Not Attempted
                            </span>
                          )}
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {item.question.type}
                          </span>
                          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {isAttempted ? `${formatMarks(item.marksAwarded)} / ${formatMarks(item.maxMarks)}` : `0 / ${formatMarks(item.maxMarks)}`}
                          </span>
                        </div>
                      </div>

                      {item.question.type === "MCQ" ? (
                        <div className="mt-3 space-y-2">
                          {item.question.mcqOptions.map((option) => {
                            const isSelected = selected.has(option.id);
                            const isCorrect = option.isCorrect;
                            const optionClass = isCorrect
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : isSelected
                              ? "border-rose-200 bg-rose-50 text-rose-900"
                              : "border-slate-200 bg-slate-50 text-slate-700";

                            return (
                              <div
                                key={option.id}
                                className={`rounded-xl border px-3 py-2 text-sm ${optionClass}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex flex-col gap-1.5">
                                    <span>{option.optionText}</span>
                                    {option.imageUrl && (
                                      <div className="max-w-full">
                                        <img
                                          src={option.imageUrl.startsWith("http") ? option.imageUrl : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}${option.imageUrl}`}
                                          alt={`Option ${option.optionText}`}
                                          className="max-h-20 rounded-lg object-contain border border-slate-200 bg-white"
                                        />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {isCorrect ? (
                                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                        Correct
                                      </span>
                                    ) : null}
                                    {isSelected ? (
                                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isCorrect ? "bg-sky-100 text-sky-800" : "bg-rose-100 text-rose-800"}`}>
                                        Selected
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-3 space-y-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Student answer
                            </p>
                            <p className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                              {item.studentAnswer?.textAnswer?.trim() || "No answer submitted"}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Accepted answers
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {item.question.acceptedAnswers.length > 0 ? (
                                item.question.acceptedAnswers.map((answer, answerIndex) => (
                                  <span
                                    key={`${item.attemptQuestionId}-accepted-${answerIndex}-${answer}`}
                                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900"
                                  >
                                    {answer}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-slate-500">No accepted answers configured.</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
