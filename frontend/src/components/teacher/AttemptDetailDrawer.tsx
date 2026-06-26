"use client";

import type { AttemptDetail } from "@/lib/api/results";

type AttemptDetailDrawerProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  attempt: AttemptDetail | null;
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
  onClose
}: AttemptDetailDrawerProps) {
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
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm text-slate-600">
                    Score: <span className="font-semibold text-slate-900">{attempt.score ?? 0}</span> /{" "}
                    <span className="font-semibold text-slate-900">{attempt.totalMarks}</span>
                  </p>
                </div>

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
                                  <span>{option.optionText}</span>
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
        </div>
      </aside>
    </div>
  );
}
