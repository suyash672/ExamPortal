"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  createQuestion,
  updateQuestion,
  type QuestionRecord
} from "@/lib/api/questions";
import { useToast } from "@/components/ui/ToastProvider";

const mcqOptionSchema = z.object({
  optionText: z.string().trim().min(1, "Option text is required.").max(500),
  scorePercent: z.coerce.number().int().min(0).max(100)
});

const mcqQuestionSchema = z.object({
  qbId: z.string(),
  type: z.literal("MCQ"),
  questionText: z.string().trim().min(5, "Question text must be at least 5 characters.").max(1000),
  options: z.array(mcqOptionSchema).min(2, "Add at least 2 options.").max(6, "Maximum 6 options allowed.")
});

const textQuestionSchema = z.object({
  qbId: z.string(),
  type: z.literal("TEXT"),
  questionText: z.string().trim().min(5, "Question text must be at least 5 characters.").max(1000),
  acceptedAnswers: z.array(
    z.string().trim().min(1, "Accepted answer is required.").max(200).transform((value) => value.toLowerCase())
  ).min(1, "Add at least 1 accepted answer.").max(10, "Maximum 10 accepted answers allowed.")
});

const questionFormSchema = z
  .discriminatedUnion("type", [mcqQuestionSchema, textQuestionSchema])
  .superRefine((data, context) => {
    if (data.type !== "MCQ") {
      return;
    }

    const total = data.options.reduce((sum, option) => sum + option.scorePercent, 0);
    const hasPositive = data.options.some((option) => option.scorePercent > 0);

    if (total !== 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Total score must equal 100."
      });
    }

    if (!hasPositive) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "At least one option must have a score greater than 0."
      });
    }
  });

type QuestionFormValues = z.infer<typeof questionFormSchema>;

type QuestionFormModalProps = {
  open: boolean;
  qbId: string;
  onOpenChange: (open: boolean) => void;
  onApply: (values: any, questionId?: string) => void;
  question?: QuestionRecord | null;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  questionNumber?: number;
};

function normalizeQuestion(
  question: QuestionRecord | null | undefined,
  qbId: string
): QuestionFormValues {
  if (!question) {
    return {
      qbId,
      type: "MCQ",
      questionText: "",
      options: [
        { optionText: "", scorePercent: 0 },
        { optionText: "", scorePercent: 100 }
      ]
    };
  }

  if (question.type === "MCQ") {
    const mcqOptions = question.mcqOptions ?? [];

    return {
      qbId: question.qbId || qbId,
      type: "MCQ",
      questionText: question.questionText,
      options: mcqOptions.length
        ? mcqOptions.map((option) => ({
            optionText: option.optionText,
            scorePercent: option.scorePercent
          }))
        : [
            { optionText: "", scorePercent: 0 },
            { optionText: "", scorePercent: 100 }
          ]
    };
  }

  const acceptedAnswers = question.acceptedAnswers ?? [];

  return {
    qbId: question.qbId || qbId,
    type: "TEXT",
    questionText: question.questionText,
    acceptedAnswers: acceptedAnswers.length
      ? acceptedAnswers.map((answer) => answer.answerText)
      : [""]
  };
}

type McqMode = "single-correct" | "multi-correct" | "invalid";

function getMcqStatus(optionValues: Array<{ scorePercent: number }> | undefined) {
  const total = (optionValues ?? []).reduce((sum, option) => sum + Number(option?.scorePercent || 0), 0);
  const positiveCount = (optionValues ?? []).filter((option) => Number(option?.scorePercent || 0) > 0).length;

  if (total !== 100) {
    return {
      total,
      positiveCount,
      mode: "invalid" as const,
      message: `Sum of percentages should be 100% only. Current total is ${total}%.`
    };
  }

  if (positiveCount === 0) {
    return {
      total,
      positiveCount,
      mode: "invalid" as const,
      message: "At least one option must have a score greater than 0%."
    };
  }

  return {
    total,
    positiveCount,
    mode: (positiveCount === 1 ? "single-correct" : "multi-correct") as McqMode,
    message: null as string | null
  };
}

function ScorePreview({
  total,
  positiveCount,
  mode,
  message
}: {
  total: number;
  positiveCount: number;
  mode: McqMode;
  message: string | null;
}) {
  const isValid = mode !== "invalid";

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${isValid ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Total score: {total}%</span>
        <span className="font-medium">{isValid ? mode : "Invalid total"}</span>
      </div>
      {total !== 100 ? (
        <p className="mt-2 text-xs font-semibold leading-5">
          Total percentage must be exactly 100%. Please adjust option scores.
        </p>
      ) : null}
      <p className="mt-2 text-xs leading-5">
        {message ??
          (mode === "single-correct"
            ? "Exactly one option carries 100%, so this will render as radio selection."
            : "Multiple options carry marks, so this will render as checkbox selection.")}
      </p>
      <p className="mt-1 text-xs leading-5 opacity-80">
        Positive options: {positiveCount}
      </p>
    </div>
  );
}

export function QuestionFormModal({
  open,
  qbId,
  onOpenChange,
  onApply,
  question,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  questionNumber
}: QuestionFormModalProps) {
  const { showToast } = useToast();
  const isEdit = Boolean(question);

  const {
    register,
    control,
    handleSubmit,
    reset,
    clearErrors,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting }
  } = useForm<QuestionFormValues>({
    resolver: zodResolver(questionFormSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: normalizeQuestion(question, qbId)
  });

  const type = useWatch({ control, name: "type" });
  const optionValues = useWatch({ control, name: "options" }) ?? [];
  const acceptedAnswerValues = useWatch({ control, name: "acceptedAnswers" }) ?? [];
  const questionErrors = errors as any;

  const optionArray = useFieldArray({
    control: control as any,
    name: "options"
  });
  const acceptedAnswerArray = useFieldArray({
    control: control as any,
    name: "acceptedAnswers"
  });

  useEffect(() => {
    if (open) {
      reset(normalizeQuestion(question, qbId));
    }
  }, [open, qbId, question, reset]);

  const mcqStatus = useMemo(() => {
    if (type !== "MCQ") {
      return null;
    }

    return getMcqStatus(optionValues);
  }, [optionValues, type]);

  useEffect(() => {
    if (type !== "MCQ") {
      clearErrors();
      return;
    }

    if (mcqStatus?.message) {
      setError("root", { type: "validate", message: mcqStatus.message });
      return;
    }

    clearErrors();
  }, [clearErrors, mcqStatus?.message, setError, type]);

  const onSubmit = async (values: QuestionFormValues, eventOrClose?: any) => {
    const closeAfterSave = typeof eventOrClose === "boolean" ? eventOrClose : true;
    try {
      if (values.type === "MCQ") {
        const status = getMcqStatus(values.options);

        if (status.message) {
          setError("root", { message: status.message });
          return;
        }
      }

      onApply(values, question?.id);
      
      if (closeAfterSave) {
        reset(values); // reset so it's no longer dirty
        onOpenChange(false);
      }
    } catch {
      setError("root", { message: "Unable to apply changes." });
    }
  };

  const checkIsDirty = () => {
    const current = getValues();
    const initial = normalizeQuestion(question, qbId);
    
    const cleanObject = (val: any) => {
      if (!val) return {};
      return {
        type: val.type,
        questionText: (val.questionText || "").trim(),
        options: val.type === "MCQ" ? (val.options || []).map((o: any) => ({
          optionText: (o?.optionText || "").trim(),
          scorePercent: Number(o?.scorePercent || 0)
        })) : [],
        acceptedAnswers: val.type === "TEXT" ? (val.acceptedAnswers || []).map((a: string) => (a || "").trim().toLowerCase()) : []
      };
    };
    
    return JSON.stringify(cleanObject(current)) !== JSON.stringify(cleanObject(initial));
  };

  const handleNavigate = async (direction: "next" | "prev") => {
    if (checkIsDirty()) {
      await handleSubmit(
        async (values) => {
          await onSubmit(values, false);
          reset(values);
          if (direction === "next" && onNext) onNext();
          if (direction === "prev" && onPrevious) onPrevious();
        },
        () => {
          if (direction === "next" && onNext) onNext();
          if (direction === "prev" && onPrevious) onPrevious();
        }
      )();
    } else {
      if (direction === "next" && onNext) onNext();
      if (direction === "prev" && onPrevious) onPrevious();
    }
  };

  const handleClose = () => {
    if (checkIsDirty()) {
      handleSubmit(
        async (values) => {
          await onSubmit(values, true);
        },
        () => {
          onOpenChange(false);
        }
      )();
    } else {
      onOpenChange(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div 
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm"
    >
        <div 
          onClick={(e) => e.stopPropagation()}
          className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
        >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
              {isEdit ? "Edit question" : "New question"}
            </p>
            <div className="flex items-center gap-4">
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                {isEdit ? `Update question ${questionNumber ? `#${questionNumber}` : ""}` : "Create a question"}
              </h2>
              {isEdit && onPrevious && onNext && (
                <div className="mt-1 flex items-center gap-1 rounded-xl bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => handleNavigate("prev")}
                    disabled={!hasPrevious || isSubmitting}
                    className="rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    &lt; Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate("next")}
                    disabled={!hasNext || isSubmitting}
                    className="rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    Next &gt;
                  </button>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close question modal"
          >
            ×
          </button>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            {[
              { label: "MCQ", value: "MCQ" as const },
              { label: "TEXT", value: "TEXT" as const }
            ].map((mode) => (
              <label
                key={mode.value}
                className={`cursor-pointer rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
                  type === mode.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                <input type="radio" value={mode.value} className="sr-only" {...register("type")} />
                {mode.label}
              </label>
            ))}
          </div>

          <input type="hidden" value={qbId} {...register("qbId")} />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="questionText">
              Question text
            </label>
            <textarea
              id="questionText"
              rows={4}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              {...register("questionText")}
            />
            {errors.questionText ? (
              <p className="text-xs text-[var(--danger)]">{errors.questionText.message}</p>
            ) : null}
          </div>

          {type === "MCQ" ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">MCQ options</h3>
                <button
                  type="button"
                  onClick={() => optionArray.append({ optionText: "", scorePercent: 0 })}
                  disabled={optionValues?.length >= 6}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add Option
                </button>
              </div>


              <div className="space-y-3">
                {optionArray.fields.map((field, index) => (
                  <div key={field.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_140px_auto] md:items-start">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Option {index + 1}
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
                        {...register(`options.${index}.optionText` as const)}
                      />
                      {questionErrors.options?.[index]?.optionText ? (
                        <p className="text-xs text-[var(--danger)]">
                          {questionErrors.options[index]?.optionText?.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Score %
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
                        {...register(`options.${index}.scorePercent` as const, {
                          valueAsNumber: true
                        })}
                      />
                      {questionErrors.options?.[index]?.scorePercent ? (
                        <p className="text-xs text-[var(--danger)]">
                          {questionErrors.options[index]?.scorePercent?.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2 pt-6">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                          checked={optionValues[index]?.scorePercent === 100}
                          onChange={(e) => {
                            if (e.target.checked) {
                              optionValues.forEach((_, i) => {
                                setValue(`options.${i}.scorePercent`, i === index ? 100 : 0, {
                                  shouldValidate: true
                                });
                              });
                            } else {
                              setValue(`options.${index}.scorePercent`, 0, {
                                shouldValidate: true
                              });
                            }
                          }}
                        />
                        <span className="text-xs font-medium uppercase tracking-[0.1em]">Set Correct</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => optionArray.remove(index)}
                        disabled={optionValues.length <= 2}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <ScorePreview
                total={mcqStatus?.total ?? 0}
                positiveCount={mcqStatus?.positiveCount ?? 0}
                mode={mcqStatus?.mode ?? "invalid"}
                message={mcqStatus?.message ?? null}
              />
              {questionErrors.options ? (
                <p className="text-sm text-[var(--danger)]">
                  {Array.isArray(questionErrors.options)
                    ? questionErrors.options.find(Boolean)?.message
                    : (questionErrors.options.message as string | undefined)}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Accepted answers</h3>
                <button
                  type="button"
                  onClick={() => acceptedAnswerArray.append("")}
                  disabled={acceptedAnswerValues?.length >= 10}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add Answer
                </button>
              </div>

              <div className="space-y-3">
                {acceptedAnswerArray.fields.map((field, index) => (
                  <div key={field.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_auto] md:items-start">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Answer {index + 1}
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
                        {...register(`acceptedAnswers.${index}` as const)}
                      />
                      {questionErrors.acceptedAnswers?.[index] ? (
                        <p className="text-xs text-[var(--danger)]">
                          {questionErrors.acceptedAnswers[index]?.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-start pt-6">
                      <button
                        type="button"
                        onClick={() => acceptedAnswerArray.remove(index)}
                        disabled={acceptedAnswerValues.length <= 1}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {errors.root?.message ? (
            <p className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 text-sm text-[var(--danger)]">
              {errors.root.message}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit((v) => onSubmit(v, true))}
              disabled={isSubmitting}
              className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Applying..." : isEdit ? "Update question" : "Create question"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
