"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CsvImportTab } from "@/components/teacher/CsvImportTab";
import { QuestionFormModal } from "@/components/teacher/QuestionFormModal";
import { useToast } from "@/components/ui/ToastProvider";
import { getModules, type ModuleRecord } from "@/lib/api/modules";
import { deleteQuestion, getQuestions, type QuestionRecord } from "@/lib/api/questions";
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
  const { showToast } = useToast();

  const subjectId = normalizeParam(params?.subjectId);
  const moduleId = normalizeParam(params?.moduleId);
  const qbId = normalizeParam(params?.qbId);

  const [subject, setSubject] = useState<SubjectRecord | null>(null);
  const [module, setModule] = useState<ModuleRecord | null>(null);
  const [qb, setQb] = useState<QuestionBankRecord | null>(null);
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"questions" | "csv">("questions");
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionRecord | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    } catch {
      setError("Unable to load questions. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [moduleId, qbId, subjectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  const handleDelete = async (question: QuestionRecord) => {
    const confirmed = window.confirm(`Delete question?`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(question.id);
      await deleteQuestion(question.id);
      showToast("Question deleted");
      await loadData();
    } catch (error: any) {
      showToast(error?.response?.data?.message ?? "Failed to delete question", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const questionRows = questions.filter((question) => question.deletedAt === null);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          {breadcrumb.map((item, index) =>
            item.href ? (
              <span key={item.label}>
                <Link href={item.href} className="font-medium text-[var(--primary)] hover:underline">
                  {item.label}
                </Link>
                {index < breadcrumb.length - 1 ? <span className="px-1 text-slate-300">&gt;</span> : null}
              </span>
            ) : (
              <span key={item.label} className="font-medium text-slate-900">
                {item.label}
              </span>
            )
          )}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">{qb?.name ?? "Question bank"}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Manage questions directly or import them in bulk using CSV.
            </p>
          </div>
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
                <h2 className="text-lg font-semibold text-slate-900">No questions yet</h2>
                <p className="mt-2 text-sm text-slate-500">Add your first question or import a CSV template.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
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
                    {questionRows.map((question) => {
                      const expanded = expandedQuestionId === question.id;

                      return (
                        <Fragment key={question.id}>
                          <tr key={question.id} className="align-top transition hover:bg-slate-50/60">
                            <td className="px-4 py-4 align-top">
                              <TypeBadge type={question.type} />
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700">
                              <button
                                type="button"
                                onClick={() => setExpandedQuestionId(expanded ? null : question.id)}
                                className="text-left font-medium text-slate-900 hover:text-[var(--primary)]"
                              >
                                {truncateText(question.questionText, 80)}
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
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(question)}
                                  disabled={deletingId === question.id}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deletingId === question.id ? (
                                    <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  ) : null}
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expanded && question.type === "MCQ" ? (
                            <tr>
                              <td colSpan={3} className="bg-slate-50 px-4 py-4">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    MCQ options
                                  </p>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {question.mcqOptions.map((option) => (
                                      <div key={option.id ?? option.optionText} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                        <span className="font-medium text-slate-900">{option.optionText}</span>
                                        <span className="ml-2 text-slate-500">({option.scorePercent}%)</span>
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
            <CsvImportTab qbId={qbId} />
          )}
        </div>
      </div>

      <QuestionFormModal
        open={questionModalOpen}
        qbId={qbId}
        question={editingQuestion}
        onOpenChange={setQuestionModalOpen}
        onSaved={loadData}
      />
    </div>
  );
}
