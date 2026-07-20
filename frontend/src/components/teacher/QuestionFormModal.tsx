"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  createQuestion,
  updateQuestion,
  uploadQuestionImage,
  type QuestionRecord
} from "@/lib/api/questions";
import { useToast } from "@/components/ui/ToastProvider";

const mcqOptionSchema = z.object({
  optionText: z.string().trim().max(500).default(""),
  imageUrl: z.string().optional().nullable(),
  scorePercent: z.coerce.number().int().min(0).max(100)
});

const mcqQuestionSchema = z.object({
  qbId: z.string(),
  type: z.literal("MCQ"),
  questionText: z.string().trim().max(1000).default(""),
  imageUrl: z.string().optional().nullable(),
  options: z.array(mcqOptionSchema).min(2, "Add at least 2 options.").max(6, "Maximum 6 options allowed.")
});

const textQuestionSchema = z.object({
  qbId: z.string(),
  type: z.literal("TEXT"),
  questionText: z.string().trim().max(1000).default(""),
  imageUrl: z.string().optional().nullable(),
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
      imageUrl: "",
      options: [
        { optionText: "", imageUrl: "", scorePercent: 0 },
        { optionText: "", imageUrl: "", scorePercent: 100 }
      ]
    };
  }

  if (question.type === "MCQ") {
    const mcqOptions = question.mcqOptions ?? [];

    return {
      qbId: question.qbId || qbId,
      type: "MCQ",
      questionText: question.questionText,
      imageUrl: question.imageUrl || "",
      options: mcqOptions.length
        ? mcqOptions.map((option) => ({
            optionText: option.optionText,
            imageUrl: option.imageUrl || "",
            scorePercent: option.scorePercent
          }))
        : [
            { optionText: "", imageUrl: "", scorePercent: 0 },
            { optionText: "", imageUrl: "", scorePercent: 100 }
          ]
    };
  }

  const acceptedAnswers = question.acceptedAnswers ?? [];

  return {
    qbId: question.qbId || qbId,
    type: "TEXT",
    questionText: question.questionText,
    imageUrl: question.imageUrl || "",
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

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadingOptionIndex, setUploadingOptionIndex] = useState<number | null>(null);

  // Layout and Field Config State
  const [layoutMode, setLayoutMode] = useState<"standard" | "image-only">("standard");
  const [answerType, setAnswerType] = useState<"MCQ_CUSTOM" | "MCQ_DEFAULT" | "TEXT">("MCQ_CUSTOM");
  const [defaultOptionSet, setDefaultOptionSet] = useState<"ABCD" | "ABCDE" | "TRUEFALSE">("ABCD");
  const [showQuestionText, setShowQuestionText] = useState(true);
  const [showImageUpload, setShowImageUpload] = useState(true);

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
  const imageUrl = useWatch({ control, name: "imageUrl" });
  const optionValues = useWatch({ control, name: "options" }) ?? [];
  const acceptedAnswerValues = useWatch({ control, name: "acceptedAnswers" }) ?? [];
  const questionErrors = errors as any;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await uploadQuestionImage(formData);
      setValue("imageUrl", res.imageUrl, { shouldValidate: true, shouldDirty: true });
      showToast("Image uploaded successfully");
    } catch (err) {
      showToast("Failed to upload image", "error");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleOptionImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingOptionIndex(index);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await uploadQuestionImage(formData);
      setValue(`options.${index}.imageUrl`, res.imageUrl, { shouldValidate: true, shouldDirty: true });
      showToast("Option image uploaded successfully");
    } catch (err) {
      showToast("Failed to upload option image", "error");
    } finally {
      setUploadingOptionIndex(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    
    // Only read from localStorage if creating a NEW question!
    if (!isEdit) {
      try {
        const savedConfig = localStorage.getItem("question_modal_layout_config");
        if (savedConfig) {
          const config = JSON.parse(savedConfig);
          if (config.layoutMode) {
            setLayoutMode(config.layoutMode);
            if (config.layoutMode === "image-only") {
              setShowQuestionText(false);
              setShowImageUpload(true);
            }
          }
          if (config.answerType) {
            setAnswerType(config.answerType);
            setValue("type", config.answerType === "TEXT" ? "TEXT" : "MCQ");
          }
          if (config.defaultOptionSet) setDefaultOptionSet(config.defaultOptionSet);
          if (config.showQuestionText !== undefined && config.layoutMode !== "image-only") {
            setShowQuestionText(config.showQuestionText);
          }
          if (config.showImageUpload !== undefined) setShowImageUpload(config.showImageUpload);
        }
      } catch (e) {
        console.error("Failed to load layout config", e);
      }
    } else {
      // Auto-detect config for existing question on edit mode!
      if (question) {
        const hasText = question.questionText && question.questionText.trim().length > 0;
        setShowQuestionText(hasText || false);
        
        const hasImage = question.imageUrl && question.imageUrl.trim().length > 0;
        setShowImageUpload(hasImage || false);

        setLayoutMode(!hasText && hasImage ? "image-only" : "standard");

        if (question.type === "TEXT") {
          setAnswerType("TEXT");
        } else {
          const texts = (question.mcqOptions || []).map(o => o.optionText.trim().toUpperCase());
          const isABCD = texts.length === 4 && ["A", "B", "C", "D"].every((val, idx) => texts[idx] === val);
          const isABCDE = texts.length === 5 && ["A", "B", "C", "D", "E"].every((val, idx) => texts[idx] === val);
          const isTrueFalse = texts.length === 2 && ["TRUE", "FALSE"].every((val, idx) => texts[idx] === val || (texts[0] === "TRUE" && texts[1] === "FALSE") || (texts[0] === "YES" && texts[1] === "NO"));

          if (isABCD) {
            setAnswerType("MCQ_DEFAULT");
            setDefaultOptionSet("ABCD");
          } else if (isABCDE) {
            setAnswerType("MCQ_DEFAULT");
            setDefaultOptionSet("ABCDE");
          } else if (isTrueFalse) {
            setAnswerType("MCQ_DEFAULT");
            setDefaultOptionSet("TRUEFALSE");
          } else {
            setAnswerType("MCQ_CUSTOM");
          }
        }
      }
    }
  }, [open, isEdit, question]);

  const saveLayoutConfig = (updates: Partial<{
    layoutMode: "standard" | "image-only";
    answerType: "MCQ_CUSTOM" | "MCQ_DEFAULT" | "TEXT";
    defaultOptionSet: "ABCD" | "ABCDE" | "TRUEFALSE";
    showQuestionText: boolean;
    showImageUpload: boolean;
  }>) => {
    // Only save sticky configs when creating a NEW question!
    if (!isEdit) {
      try {
        const current = {
          layoutMode,
          answerType,
          defaultOptionSet,
          showQuestionText,
          showImageUpload,
          ...updates
        };
        localStorage.setItem("question_modal_layout_config", JSON.stringify(current));
      } catch (e) {
        console.error("Failed to save layout config", e);
      }
    }
  };

  const applyDefaultOptions = (set: "ABCD" | "ABCDE" | "TRUEFALSE") => {
    let defaultLabels: string[] = [];
    if (set === "ABCD") defaultLabels = ["A", "B", "C", "D"];
    else if (set === "ABCDE") defaultLabels = ["A", "B", "C", "D", "E"];
    else if (set === "TRUEFALSE") defaultLabels = ["True", "False"];

    const currentOptions = getValues("options") || [];
    const newOptions = defaultLabels.map((label, idx) => {
      const existing = currentOptions[idx];
      return {
        optionText: label,
        imageUrl: existing?.imageUrl || "",
        scorePercent: existing?.scorePercent !== undefined ? existing.scorePercent : (idx === 0 ? 100 : 0)
      };
    });

    const totalScore = newOptions.reduce((sum, o) => sum + o.scorePercent, 0);
    if (totalScore !== 100) {
      newOptions.forEach((o, i) => {
        o.scorePercent = i === 0 ? 100 : 0;
      });
    }

    setValue("options", newOptions, { shouldValidate: true, shouldDirty: true });
  };

  useEffect(() => {
    if (answerType === "MCQ_DEFAULT") {
      applyDefaultOptions(defaultOptionSet);
    }
  }, [answerType, defaultOptionSet]);

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
        imageUrl: val.imageUrl || "",
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

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === "textarea" && !e.altKey && !e.ctrlKey) {
          return;
        }

        e.preventDefault();
        if (e.key === "ArrowDown" && hasNext && !isSubmitting) {
          void handleNavigate("next");
        } else if (e.key === "ArrowUp" && hasPrevious && !isSubmitting) {
          void handleNavigate("prev");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, hasNext, hasPrevious, isSubmitting, handleNavigate]);

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
        className="max-h-[90vh] w-full max-w-3xl flex flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
              {isEdit ? "Edit question" : "New question"}
            </p>
            <div className="flex items-center gap-4 mt-1">
              <h2 className="text-xl font-semibold text-slate-900">
                {isEdit ? `Update question ${questionNumber ? `#${questionNumber}` : ""}` : "Create a question"}
              </h2>
              {isEdit && onPrevious && onNext && (
                <div className="flex items-center gap-1 rounded-xl bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => handleNavigate("prev")}
                    disabled={!hasPrevious || isSubmitting}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    &lt; Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigate("next")}
                    disabled={!hasNext || isSubmitting}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
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
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            aria-label="Close question modal"
          >
            <span className="flex h-5 w-5 items-center justify-center text-xl font-bold leading-none">×</span>
          </button>
        </div>
        <form className="flex-1 overflow-y-auto p-6 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Question Mode Configurations */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Layout & Options Configuration</h3>
            
            {/* Row 1: Layout Selection */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setLayoutMode("standard");
                  setShowQuestionText(true);
                  saveLayoutConfig({ layoutMode: "standard", showQuestionText: true });
                }}
                className={`rounded-xl py-2 text-center text-sm font-semibold border transition ${
                  layoutMode === "standard"
                    ? "border-[var(--primary)] bg-white text-slate-900 shadow-sm"
                    : "border-slate-200 bg-slate-100/50 text-slate-500 hover:bg-white"
                }`}
              >
                📝 Standard Layout
              </button>
              <button
                type="button"
                onClick={() => {
                  setLayoutMode("image-only");
                  setShowQuestionText(false);
                  setShowImageUpload(true); // Image is mandatory for image-only
                  setValue("questionText", ""); // Clear text
                  saveLayoutConfig({ layoutMode: "image-only", showQuestionText: false, showImageUpload: true });
                }}
                className={`rounded-xl py-2 text-center text-sm font-semibold border transition ${
                  layoutMode === "image-only"
                    ? "border-[var(--primary)] bg-white text-slate-900 shadow-sm"
                    : "border-slate-200 bg-slate-100/50 text-slate-500 hover:bg-white"
                }`}
              >
                🖼️ Image-Only Layout
              </button>
            </div>

            {/* Row 2: Answer Entry Type */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAnswerType("MCQ_CUSTOM");
                  setValue("type", "MCQ");
                  saveLayoutConfig({ answerType: "MCQ_CUSTOM" });
                }}
                className={`rounded-xl py-2 text-center text-xs font-semibold border transition ${
                  answerType === "MCQ_CUSTOM"
                    ? "border-indigo-500 bg-indigo-50/50 text-indigo-700 shadow-sm"
                    : "border-slate-200 bg-slate-100/50 text-slate-500 hover:bg-white"
                }`}
              >
                ✏️ Custom MCQs
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnswerType("MCQ_DEFAULT");
                  setValue("type", "MCQ");
                  applyDefaultOptions(defaultOptionSet);
                  saveLayoutConfig({ answerType: "MCQ_DEFAULT" });
                }}
                className={`rounded-xl py-2 text-center text-xs font-semibold border transition ${
                  answerType === "MCQ_DEFAULT"
                    ? "border-teal-500 bg-teal-50/50 text-teal-700 shadow-sm"
                    : "border-slate-200 bg-slate-100/50 text-slate-500 hover:bg-white"
                }`}
              >
                🔠 Default (A/B/C/D)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnswerType("TEXT");
                  setValue("type", "TEXT");
                  saveLayoutConfig({ answerType: "TEXT" });
                }}
                className={`rounded-xl py-2 text-center text-xs font-semibold border transition ${
                  answerType === "TEXT"
                    ? "border-amber-500 bg-amber-50/50 text-amber-700 shadow-sm"
                    : "border-slate-200 bg-slate-100/50 text-slate-500 hover:bg-white"
                }`}
              >
                💬 Textbox Answer
              </button>
            </div>

            {/* Conditional Sub-settings for Defaults */}
            {answerType === "MCQ_DEFAULT" && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-t border-slate-200 pt-3 gap-2">
                <span className="text-xs font-semibold text-slate-500">Letter Set:</span>
                <div className="flex gap-2">
                  {[
                    { label: "A/B/C/D", value: "ABCD" as const },
                    { label: "A/B/C/D/E", value: "ABCDE" as const },
                    { label: "True / False", value: "TRUEFALSE" as const }
                  ].map((set) => (
                    <button
                      key={set.value}
                      type="button"
                      onClick={() => {
                        setDefaultOptionSet(set.value);
                        saveLayoutConfig({ defaultOptionSet: set.value });
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                        defaultOptionSet === set.value
                          ? "border-slate-800 bg-slate-900 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {set.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Field Visibility Customizers (Only in standard layout) */}
            {layoutMode === "standard" && (
              <div className="flex items-center gap-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
                <span className="font-semibold">Enabled Fields:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showQuestionText}
                    onChange={(e) => {
                      setShowQuestionText(e.target.checked);
                      saveLayoutConfig({ showQuestionText: e.target.checked });
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                  <span>Question Text</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showImageUpload}
                    onChange={(e) => {
                      setShowImageUpload(e.target.checked);
                      saveLayoutConfig({ showImageUpload: e.target.checked });
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                  <span>Image Upload</span>
                </label>
              </div>
            )}
          </div>

          <input type="hidden" value={qbId} {...register("qbId")} />

          {/* Question Text Field */}
          {showQuestionText && (
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
          )}

          {/* Image Upload Field */}
          {showImageUpload && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Question image {layoutMode === "image-only" ? "(Required)" : "(Optional)"}
              </label>
              {imageUrl ? (
                <div className="relative inline-block mt-1">
                  <img
                    src={imageUrl.startsWith("http") ? imageUrl : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}${imageUrl}`}
                    alt="Question Preview"
                    className="max-h-40 rounded-xl object-contain border border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setValue("imageUrl", null, { shouldValidate: true, shouldDirty: true })}
                    className="absolute -right-2 -top-2 rounded-full bg-rose-600 p-1 text-white shadow-md hover:bg-rose-500 transition"
                    title="Remove image"
                  >
                    <span className="flex h-4 w-4 items-center justify-center text-xs font-bold">×</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 mt-1">
                  <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                    {isUploadingImage ? "Uploading..." : "Upload Image"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isUploadingImage}
                      className="hidden"
                    />
                  </label>
                  <span className="text-xs text-slate-400">Supports PNG, JPG, JPEG, GIF, WEBP</span>
                </div>
              )}
            </div>
          )}

          {/* MCQ Options OR Textbox Answer Section */}
          {type === "MCQ" ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">MCQ options</h3>
                {answerType === "MCQ_CUSTOM" && (
                  <button
                    type="button"
                    onClick={() => optionArray.append({ optionText: "", imageUrl: "", scorePercent: 0 })}
                    disabled={optionValues?.length >= 6}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add Option
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {optionArray.fields.map((field, index) => {
                  const defaultLabels = ["A", "B", "C", "D", "E", "F"];
                  const labelText = answerType === "MCQ_DEFAULT"
                    ? `Option ${optionValues[index]?.optionText || defaultLabels[index]}`
                    : `Option ${index + 1}`;

                  return (
                    <div key={field.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_140px_auto] md:items-start">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {labelText}
                        </label>
                        
                        <input
                          type="text"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
                          placeholder={answerType === "MCQ_DEFAULT" ? `Custom text for Option ${optionValues[index]?.optionText} (Optional)` : "Option text"}
                          {...register(`options.${index}.optionText` as const)}
                        />
                        {questionErrors.options?.[index]?.optionText ? (
                          <p className="text-xs text-[var(--danger)]">
                            {questionErrors.options[index]?.optionText?.message}
                          </p>
                        ) : null}

                        {/* Option Image Upload Control */}
                        {optionValues[index]?.imageUrl ? (
                          <div className="relative inline-block mt-2">
                            <img
                              src={optionValues[index].imageUrl.startsWith("http") ? optionValues[index].imageUrl : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}${optionValues[index].imageUrl}`}
                              alt={`Option ${index + 1} Preview`}
                              className="max-h-20 rounded-lg object-contain border border-slate-200"
                            />
                            <button
                              type="button"
                              onClick={() => setValue(`options.${index}.imageUrl`, null, { shouldValidate: true, shouldDirty: true })}
                              className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 p-0.5 text-white shadow hover:bg-rose-500 transition"
                              title="Remove option image"
                            >
                              <span className="flex h-3 w-3 items-center justify-center text-[10px] font-bold">×</span>
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1">
                            <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition">
                              <span>📷 {uploadingOptionIndex === index ? "Uploading..." : "Option Image (Optional)"}</span>
                              <input
                                type="file"
                                accept="image/*"
                                disabled={uploadingOptionIndex !== null}
                                onChange={(e) => handleOptionImageUpload(index, e)}
                                className="hidden"
                              />
                            </label>
                          </div>
                        )}
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
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
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
                        {answerType === "MCQ_CUSTOM" && (
                          <button
                            type="button"
                            onClick={() => optionArray.remove(index)}
                            disabled={optionValues.length <= 2}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
