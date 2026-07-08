"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CsvImportTab } from "@/components/teacher/CsvImportTab";
import { QuestionFormModal } from "@/components/teacher/QuestionFormModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { getApiErrorMessage } from "@/lib/apiError";
import { getModules, type ModuleRecord } from "@/lib/api/modules";
import { getQuestions, deduplicateQuestions, bulkSaveQuestions, type QuestionRecord, type QuestionPayload, type BulkSavePayload } from "@/lib/api/questions";
import { getQuestionBanks, type QuestionBankRecord } from "@/lib/api/questionbanks";
import { getSubjects, type SubjectRecord } from "@/lib/api/subjects";

function normalizeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function TypeBadge({ type }: { type: QuestionRecord["type"] }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${type === "MCQ" ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-700"}`}>
      {type}
    </span>
  );
}

function truncateText(text: string, limit = 80) {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit).trimEnd()}...`;
}

export default function QuestionsPage() {
  const params = useParams<{ subjectId: string; moduleId: string; qbId: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const subjectId = normalizeParam(params?.subjectId);
  const moduleId = normalizeParam(params?.moduleId);
  const qbId = normalizeParam(params?.qbId);

  const [subject, setSubject] = useState<SubjectRecord | null>(null);
  const [module, setModule] = useState<ModuleRecord | null>(null);
  const [qb, setQb] = useState<QuestionBankRecord | null>(null);
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [draftQuestions, setDraftQuestions] = useState<QuestionRecord[]>([]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"questions" | "csv">("questions");
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionRecord | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QuestionRecord | null>(null);
  const [deduplicating, setDeduplicating] = useState(false);

  const loadData = useCallback(async () => {
    if (!subjectId || !moduleId || !qbId) {
      setError("Missing route parameters.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [subjectsData, modulesData, qbsData, questionsData] = await Promise.all([
        getSubjects(),
        getModules(subjectId),
        getQuestionBanks(moduleId),
        getQuestions(qbId)
      ]);

      setSubject(subjectsData.find((item) => item.id === subjectId) ?? null);
      setModule(modulesData.find((item) => item.id === moduleId) ?? null);
      setQb(qbsData.find((item) => item.id === qbId) ?? null);
      setQuestions(questionsData);
      setDraftQuestions(questionsData);
      setDeletedIds(new Set());
      setHasUnsavedChanges(false);
    } catch {
      setError("Unable to load questions. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [moduleId, qbId, subjectId]);

  const refreshQuestions = useCallback(async () => {
    if (!qbId) return;
    try {
      const questionsData = await getQuestions(qbId);
      setQuestions(questionsData);
      setDraftQuestions(questionsData);
      setDeletedIds(new Set());
      setHasUnsavedChanges(false);
    } catch {
      showToast("Could not refresh questions list. Please reload the page.", "error");
    }
  }, [qbId, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    const handleAnchorClick = (e: MouseEvent) => {
      if (!hasUnsavedChanges) return;

      const target = e.target as HTMLElement;
      const anchor = target.closest("a");

      if (anchor && anchor.href) {
        // Ignore links meant to open in new tab
        if (anchor.target === "_blank") return;

        const targetUrl = new URL(anchor.href);
        const currentUrl = new URL(window.location.href);

        // Verify if it's actually navigating to a different page/search route
        if (
          targetUrl.origin !== currentUrl.origin ||
          targetUrl.pathname !== currentUrl.pathname ||
          targetUrl.search !== currentUrl.search
        ) {
          e.preventDefault();
          e.stopPropagation();

          const confirmLeave = window.confirm(
            "You have unsaved changes. Are you sure you want to leave this page? Your draft changes will be lost."
          );
          if (confirmLeave) {
            if (targetUrl.origin === currentUrl.origin) {
              router.push(anchor.pathname + anchor.search + anchor.hash);
            } else {
              window.location.href = anchor.href;
            }
          }
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleAnchorClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleAnchorClick, true);
    };
  }, [hasUnsavedChanges, router]);

  const breadcrumb = useMemo(
    () => [
      { label: "Subjects", href: "/dashboard/subjects" },
      { label: subject?.name ?? "Subject", href: `/dashboard/subjects/${subjectId}/modules` },
      { label: "Modules", href: `/dashboard/subjects/${subjectId}/modules` },
      { label: module?.name ?? "Module", href: `/dashboard/subjects/${subjectId}/modules/${moduleId}/banks` },
      { label: "Question Banks", href: `/dashboard/subjects/${subjectId}/modules/${moduleId}/banks` },
      { label: qb?.name ?? "Question Bank" },
      { label: "Questions" }
    ],
    [module?.name, moduleId, qb?.name, qbId, subject?.name, subjectId]
  );

  const handleDelete = () => {
    if (!pendingDelete) {
      return;
    }

    if (pendingDelete.id.startsWith("draft-")) {
      setDraftQuestions(current => current.filter(q => q.id !== pendingDelete.id));
    } else {
      setDeletedIds(current => {
        const next = new Set(current);
        next.add(pendingDelete.id);
        return next;
      });
    }
    
    setHasUnsavedChanges(true);
    showToast("Question deleted from draft");
    setPendingDelete(null);
  };

  const handleDuplicate = (question: QuestionRecord, index: number) => {
    const newDraft = { ...question, id: `draft-${Date.now()}-${Math.random().toString(36).substring(2)}` };
    const newDrafts = [...draftQuestions];
    newDrafts.splice(index + 1, 0, newDraft);
    setDraftQuestions(newDrafts);
    setHasUnsavedChanges(true);
    showToast("Question duplicated");
  };

  const handleDeduplicate = () => {
    if (questionRows.length === 0) return;
    setDeduplicating(true);
    try {
      // 1. Group active questions by key
      const groups: { [key: string]: QuestionRecord[] } = {};
      for (const q of questionRows) {
        // Generate unique key matching the backend logic
        const mcqOpts = [...(q.mcqOptions ?? [])]
          .map(o => ({ optionText: (o.optionText || "").trim(), scorePercent: Number(o.scorePercent || 0) }))
          .sort((a, b) => a.optionText.localeCompare(b.optionText));
        const mcqKey = mcqOpts.map(o => `${o.optionText}:${o.scorePercent}`).join('|');

        const accAnswers = [...(q.acceptedAnswers ?? [])]
          .map(a => (a.answerText || "").trim().toLowerCase())
          .sort((a, b) => a.localeCompare(b));
        const textKey = accAnswers.join('|');

        const optionsKey = q.type === 'MCQ' ? mcqKey : textKey;
        const key = `${q.type}|${(q.questionText || "").trim().toLowerCase()}|${optionsKey}`;

        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(q);
      }

      // 2. Identify duplicates to remove
      let removedCount = 0;
      const nextDeletedIds = new Set(deletedIds);
      let nextDraftQuestions = [...draftQuestions];

      for (const key in groups) {
        const group = groups[key];
        if (group.length <= 1) continue;

        // Prefer keeping a database question (does not start with draft-)
        const dbQuestions = group.filter(q => !q.id.startsWith("draft-"));
        const keepQuestion = dbQuestions.length > 0 ? dbQuestions[0] : group[0];

        // Remove the rest
        for (const q of group) {
          if (q.id === keepQuestion.id) continue;

          if (q.id.startsWith("draft-")) {
            // Remove draft from draftQuestions array
            nextDraftQuestions = nextDraftQuestions.filter(dq => dq.id !== q.id);
          } else {
            // Mark DB question as deleted
            nextDeletedIds.add(q.id);
          }
          removedCount++;
        }
      }

      if (removedCount > 0) {
        setDraftQuestions(nextDraftQuestions);
        setDeletedIds(nextDeletedIds);
        setHasUnsavedChanges(true);
        showToast(`Removed ${removedCount} duplicate questions`);
      } else {
        showToast("No duplicates found");
      }
    } catch (error) {
      showToast("Failed to remove duplicates", "error");
    } finally {
      setDeduplicating(false);
    }
  };

  const questionRows = draftQuestions.filter((question) => !deletedIds.has(question.id));

  const handleApplyChanges = useCallback((values: any, questionId?: string) => {
    const draftRecord: Partial<QuestionRecord> = {
      qbId: values.qbId,
      type: values.type,
      questionText: values.questionText,
      imageUrl: values.imageUrl,
      mcqOptions: values.type === "MCQ" ? values.options.map((o: any) => ({
        id: `draft-opt-${Math.random().toString(36).substring(2)}`,
        optionText: o.optionText,
        scorePercent: o.scorePercent
      })) : [],
      acceptedAnswers: values.type === "TEXT" ? values.acceptedAnswers.map((a: string) => ({
        id: `draft-ans-${Math.random().toString(36).substring(2)}`,
        answerText: a
      })) : [],
      deletedAt: null
    };

    if (questionId) {
      setDraftQuestions(current => current.map(q => q.id === questionId ? { ...q, ...draftRecord } as QuestionRecord : q));
    } else {
      const newDraft = { ...draftRecord, id: `draft-${Date.now()}-${Math.random().toString(36).substring(2)}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as unknown as QuestionRecord;
      setDraftQuestions(current => [newDraft, ...current]);
    }
    setHasUnsavedChanges(true);
  }, []);

  const handleBulkSave = async () => {
    if (!qbId) return;
    try {
      setIsSavingBulk(true);
      const payload: BulkSavePayload = { creates: [], updates: [], deletes: Array.from(deletedIds) };

      for (const draft of draftQuestions) {
        if (deletedIds.has(draft.id)) continue;

        if (draft.id.startsWith("draft-")) {
          // This is a create
          payload.creates.push({
            qbId: draft.qbId,
            type: draft.type as "MCQ" | "TEXT",
            questionText: draft.questionText,
            imageUrl: draft.imageUrl,
            options: draft.mcqOptions?.map(o => ({ optionText: o.optionText, scorePercent: o.scorePercent })) ?? [],
            acceptedAnswers: draft.acceptedAnswers?.map(a => a.answerText) ?? []
          });
        } else {
          // Check if updated by comparing against original
          const original = questions.find(q => q.id === draft.id);
          if (!original) continue; // Should not happen
          
          // Simple JSON diff to check if changed
          // Since we might have mangled the IDs inside mcqOptions, let's compare the core values
          const extractCore = (q: QuestionRecord) => ({
            questionText: q.questionText,
            type: q.type,
            imageUrl: q.imageUrl,
            options: q.mcqOptions?.map(o => ({ optionText: o.optionText, scorePercent: o.scorePercent })) ?? [],
            acceptedAnswers: q.acceptedAnswers?.map(a => a.answerText) ?? []
          });

          const isChanged = JSON.stringify(extractCore(draft)) !== JSON.stringify(extractCore(original));
          if (isChanged) {
            payload.updates.push({
              id: draft.id,
              qbId: draft.qbId,
              type: draft.type as "MCQ" | "TEXT",
              questionText: draft.questionText,
              imageUrl: draft.imageUrl,
              options: draft.mcqOptions?.map(o => ({ optionText: o.optionText, scorePercent: o.scorePercent })) ?? [],
              acceptedAnswers: draft.acceptedAnswers?.map(a => a.answerText) ?? []
            });
          }
        }
      }

      await bulkSaveQuestions(qbId, payload);
      showToast("All changes saved successfully");
      await refreshQuestions();
    } catch (error: any) {
      showToast(getApiErrorMessage(error, "Failed to save changes"), "error");
    } finally {
      setIsSavingBulk(false);
    }
  };

  const currentEditIndex = editingQuestion ? questionRows.findIndex((q) => q.id === editingQuestion.id) : -1;
  const hasPreviousEdit = currentEditIndex > 0;
  const hasNextEdit = currentEditIndex >= 0 && currentEditIndex < questionRows.length - 1;

  const handlePreviousEdit = useCallback(() => {
    if (hasPreviousEdit) {
      setEditingQuestion(questionRows[currentEditIndex - 1]);
    }
  }, [hasPreviousEdit, questionRows, currentEditIndex]);

  const handleNextEdit = useCallback(() => {
    if (hasNextEdit) {
      setEditingQuestion(questionRows[currentEditIndex + 1]);
    }
  }, [hasNextEdit, questionRows, currentEditIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (expandedQuestionId === null) return;

      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") {
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();

        const currentIndex = questionRows.findIndex((q) => q.id === expandedQuestionId);
        if (currentIndex === -1) return;

        let nextIndex = currentIndex;
        if (e.key === "ArrowDown") {
          nextIndex = Math.min(questionRows.length - 1, currentIndex + 1);
        } else {
          nextIndex = Math.max(0, currentIndex - 1);
        }

        if (nextIndex !== currentIndex) {
          const nextQuestion = questionRows[nextIndex];
          setExpandedQuestionId(nextQuestion.id);

          setTimeout(() => {
            const element = document.getElementById(`question-row-${nextQuestion.id}`);
            if (element) {
              element.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 50);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [expandedQuestionId, questionRows]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          {breadcrumb.map((item, index) => {
            const key = `${item.href ?? "label"}-${item.label}-${index}`;

            return item.href ? (
              <span key={key}>
                <Link href={item.href} className="font-medium text-[var(--primary)] hover:underline">
                  {item.label}
                </Link>
                {index < breadcrumb.length - 1 ? <span className="px-1 text-slate-300">&gt;</span> : null}
              </span>
            ) : (
              <span key={key} className="font-medium text-slate-900">
                {item.label}
              </span>
            );
          })}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-slate-900">{qb?.name ?? "Question bank"}</h1>
              <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                Total Questions: {questionRows.length}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Manage questions directly or import them in bulk using CSV.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasUnsavedChanges ? (
              <button
                type="button"
                onClick={handleBulkSave}
                disabled={isSavingBulk}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {isSavingBulk ? "Saving..." : "Save All Changes"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleDeduplicate}
              disabled={deduplicating || questionRows.length === 0}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deduplicating ? "Removing..." : "Remove Duplicates"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingQuestion(null);
                setQuestionModalOpen(true);
              }}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
            >
              Add Question
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 pt-4 sm:px-6">
          <div className="inline-flex rounded-2xl bg-slate-100 p-1">
            {[
              { key: "questions", label: "Questions List" },
              { key: "csv", label: "Import CSV" }
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as "questions" | "csv")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {activeTab === "questions" ? (
            loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : questionRows.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  ❓
                </div>
                <h2 className="text-lg font-semibold text-slate-900">No questions yet</h2>
                <p className="mt-2 text-sm text-slate-500">Add your first question or import a CSV template.</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingQuestion(null);
                    setQuestionModalOpen(true);
                  }}
                  className="mt-5 inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
                >
                  Add Question
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-3xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="w-16 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Question
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {questionRows.map((question, index) => {
                      const expanded = expandedQuestionId === question.id;

                      return (
                        <Fragment key={question.id}>
                          <tr
                            key={question.id}
                            id={`question-row-${question.id}`}
                            className="align-top transition hover:bg-slate-50/60"
                          >
                            <td className="px-4 py-4 align-top text-sm font-medium text-slate-500">
                              {index + 1}
                            </td>
                            <td className="px-4 py-4 align-top">
                              <TypeBadge type={question.type} />
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">
                              <button
                                type="button"
                                onClick={() => setExpandedQuestionId(expanded ? null : question.id)}
                                className="text-left font-medium text-slate-900 hover:text-[var(--primary)]"
                              >
                                {expanded ? (
                                  <span className="whitespace-pre-wrap block" dangerouslySetInnerHTML={{ __html: question.questionText }} />
                                ) : (
                                  truncateText(question.questionText, 80)
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingQuestion(question);
                                    setQuestionModalOpen(true);
                                  }}
                                  className="rounded-xl border border-emerald-200 bg-emerald-50/30 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 shadow-sm"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicate(question, index)}
                                  className="rounded-xl border border-sky-200 bg-sky-50/30 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50 hover:text-sky-800 hover:border-sky-300 shadow-sm"
                                >
                                  Duplicate
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingDelete(question)}
                                  className="rounded-xl border border-rose-200 bg-rose-50/30 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 hover:text-rose-800 hover:border-rose-300 shadow-sm"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expanded && question.type === "MCQ" ? (
                            <tr>
                              <td colSpan={4} className="bg-slate-50 px-4 py-4">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                  {question.imageUrl && (
                                    <div className="mb-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        Question Image
                                      </p>
                                      <div className="mt-2">
                                        <img
                                          src={question.imageUrl.startsWith("http") ? question.imageUrl : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}${question.imageUrl}`}
                                          alt="Question context"
                                          className="max-h-48 rounded-xl object-contain border border-slate-200"
                                        />
                                      </div>
                                    </div>
                                  )}
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    MCQ options
                                  </p>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {(() => {
                                      const isSingleChoice = (question.mcqOptions ?? []).filter(o => o.scorePercent > 0).length === 1;
                                      return question.mcqOptions?.map((option) => {
                                        const isCorrect = option.scorePercent > 0;
                                        if (isSingleChoice) {
                                          const className = isCorrect
                                            ? "rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-950 shadow-sm"
                                            : "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700";
                                          return (
                                            <div key={option.id ?? option.optionText} className={className}>
                                              <span 
                                                className={isCorrect ? "font-semibold text-emerald-950" : "font-medium text-slate-900"}
                                                dangerouslySetInnerHTML={{ __html: option.optionText }}
                                              />
                                            </div>
                                          );
                                        } else {
                                          return (
                                            <div key={option.id ?? option.optionText} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-700 flex flex-col justify-between">
                                              <div className="flex justify-between items-start gap-2">
                                                <span 
                                                  className="font-medium text-slate-900 leading-snug"
                                                  dangerouslySetInnerHTML={{ __html: option.optionText }}
                                                />
                                                <span className="text-xs font-bold text-slate-500 whitespace-nowrap bg-slate-100 px-1.5 py-0.5 rounded-lg border border-slate-200/50">{option.scorePercent}%</span>
                                              </div>
                                              <div className="w-full h-2 bg-slate-100 rounded-full mt-3 overflow-hidden border border-slate-200/50">
                                                <div 
                                                  className={`h-full rounded-full transition-all duration-500 ${option.scorePercent > 0 ? "bg-teal-500" : "bg-slate-300"}`} 
                                                  style={{ width: `${option.scorePercent}%` }} 
                                                />
                                              </div>
                                            </div>
                                          );
                                        }
                                      });
                                    })()}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                          {expanded && question.type === "TEXT" ? (
                            <tr>
                              <td colSpan={4} className="bg-slate-50 px-4 py-4">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                  {question.imageUrl && (
                                    <div className="mb-4">
                                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        Question Image
                                      </p>
                                      <div className="mt-2">
                                        <img
                                          src={question.imageUrl.startsWith("http") ? question.imageUrl : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}${question.imageUrl}`}
                                          alt="Question context"
                                          className="max-h-48 rounded-xl object-contain border border-slate-200"
                                        />
                                      </div>
                                    </div>
                                  )}
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    Accepted Answers
                                  </p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {question.acceptedAnswers?.map((answer) => (
                                      <div key={answer.id ?? answer.answerText} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                        <span className="font-medium text-slate-900">{answer.answerText}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <CsvImportTab qbId={qbId} onImported={() => {
              void refreshQuestions();
              setActiveTab("questions");
            }} />
          )}
        </div>
      </div>

      <QuestionFormModal
        open={questionModalOpen}
        qbId={qbId}
        question={editingQuestion}
        questionNumber={currentEditIndex >= 0 ? currentEditIndex + 1 : undefined}
        onOpenChange={setQuestionModalOpen}
        onApply={handleApplyChanges}
        onPrevious={handlePreviousEdit}
        onNext={handleNextEdit}
        hasPrevious={hasPreviousEdit}
        hasNext={hasNextEdit}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete question"
        message="Remove this question from the draft? (Click Save All Changes to persist)"
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
