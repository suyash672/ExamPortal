"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createQuestionBank,
  deleteQuestionBank,
  getQuestionBanks,
  updateQuestionBank,
  type QuestionBankRecord
} from "@/lib/api/questionbanks";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getApiErrorMessage } from "@/lib/apiError";
import { getModules, type ModuleRecord } from "@/lib/api/modules";
import { getSubjects, type SubjectRecord } from "@/lib/api/subjects";
import { useToast } from "@/components/ui/ToastProvider";

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.5 2.5 0 013.536 3.536L8.25 20.17 3 21l.83-5.25 12.987-11.263z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M10 11v6M14 11v6M9 7l1-3h4l1 3m1 0v11a2 2 0 01-2 2H9a2 2 0 01-2-2V7h10z" />
    </svg>
  );
}

function normalizeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? "";
}

export default function QuestionBanksPage() {
  const params = useParams<{ subjectId: string; moduleId: string }>();
  const { showToast } = useToast();
  const subjectId = normalizeParam(params?.subjectId);
  const moduleId = normalizeParam(params?.moduleId);

  const [subject, setSubject] = useState<SubjectRecord | null>(null);
  const [module, setModule] = useState<ModuleRecord | null>(null);
  const [questionBanks, setQuestionBanks] = useState<QuestionBankRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingBank, setEditingBank] = useState<QuestionBankRecord | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("easy");
  const [customType, setCustomType] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<QuestionBankRecord | null>(null);

  const loadData = useCallback(async () => {
    if (!subjectId || !moduleId) {
      setError("Missing subject or module id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [subjectsData, modulesData, banksData] = await Promise.all([
        getSubjects(),
        getModules(subjectId),
        getQuestionBanks(moduleId)
      ]);

      setSubject(subjectsData.find((item) => item.id === subjectId) ?? null);
      setModule(modulesData.find((item) => item.id === moduleId) ?? null);
      setQuestionBanks(banksData);
    } catch {
      setError("Unable to load question banks. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [moduleId, subjectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const breadcrumb = useMemo(
    () => [
      { label: "Subjects", href: "/dashboard/subjects" },
      { label: subject?.name ?? "Subject", href: `/dashboard/subjects/${subjectId}/modules` },
      { label: "Modules", href: `/dashboard/subjects/${subjectId}/modules` },
      { label: module?.name ?? "Module", href: `/dashboard/subjects/${subjectId}/modules/${moduleId}/banks` },
      { label: "Question Banks" }
    ],
    [module?.name, moduleId, subject?.name, subjectId]
  );

  const startCreate = () => {
    setEditingBank(null);
    setFormName("");
    setFormType("easy");
    setCustomType("");
    setFormError(null);
    setShowForm(true);
  };

  const startEdit = (bank: QuestionBankRecord) => {
    setEditingBank(bank);
    setFormName(bank.name);
    if (["easy", "medium", "complex"].includes(bank.type)) {
      setFormType(bank.type);
      setCustomType("");
    } else {
      setFormType("custom");
      setCustomType(bank.type);
    }
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError("Question bank name is required.");
      return;
    }

    const typeToSave = formType === "custom" ? customType.trim() : formType;
    if (!typeToSave) {
      setFormError("Question bank type is required.");
      return;
    }

    try {
      setFormSaving(true);

      const payload = { name: trimmedName, type: typeToSave };

      if (editingBank) {
        await updateQuestionBank(editingBank.id, payload);
        showToast("Question bank updated");
      } else {
        await createQuestionBank(moduleId, payload);
        showToast("Question bank created");
      }

      setShowForm(false);
      setEditingBank(null);
      setFormName("");
      setFormType("easy");
      setCustomType("");
      await loadData();
    } catch (error: any) {
      setFormError(getApiErrorMessage(error, "Unable to save question bank."));
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) {
      return;
    }

    try {
      setDeletingId(pendingDelete.id);
      await deleteQuestionBank(pendingDelete.id);
      showToast("Question bank deleted");
      setPendingDelete(null);
      await loadData();
    } catch (error: any) {
      showToast(getApiErrorMessage(error, "Failed to delete question bank"), "error");
    } finally {
      setDeletingId(null);
    }
  };

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
            <h1 className="text-3xl font-semibold text-slate-900">Question banks</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Create, organize, and manage question banks for this module.
            </p>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
          >
            Add Question Bank
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
                {editingBank ? "Edit question bank" : "New question bank"}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                {editingBank ? "Update question bank" : "Create a question bank"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close question bank form"
            >
              ×
            </button>
          </div>

          <form className="mt-5 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="qb-name">
                  Question bank name
                </label>
                <input
                  id="qb-name"
                  type="text"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="qb-type">
                  Question bank type
                </label>
                <select
                  id="qb-type"
                  value={formType}
                  onChange={(event) => setFormType(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="complex">Complex</option>
                  <option value="custom">Custom...</option>
                </select>
              </div>
            </div>

            {formType === "custom" ? (
              <div className="space-y-1.5 max-w-md">
                <label className="text-sm font-medium text-slate-700" htmlFor="qb-custom-type">
                  Custom type name
                </label>
                <input
                  id="qb-custom-type"
                  type="text"
                  placeholder="e.g. Programming, Advanced, etc."
                  value={customType}
                  onChange={(event) => setCustomType(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
                />
              </div>
            ) : null}

            {formError ? <p className="text-xs text-[var(--danger)]">{formError}</p> : null}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={formSaving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {formSaving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : null}
                {formSaving ? "Saving..." : editingBank ? "Update QB" : "Create QB"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-6 w-44 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      ) : questionBanks.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            🗂️
          </div>
          <h2 className="text-lg font-semibold text-slate-900">No question banks yet</h2>
          <p className="mt-2 text-sm text-slate-500">Add the first question bank to begin writing questions.</p>
          <button
            type="button"
            onClick={startCreate}
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
          >
            Add Question Bank
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Question bank
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Type
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Questions
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {questionBanks.map((bank) => (
                <tr key={bank.id} className="transition hover:bg-slate-50/60">
                  <td className="px-5 py-4 text-sm font-medium text-slate-900">{bank.name}</td>
                  <td className="px-5 py-4 text-sm">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
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
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{bank._count?.questions ?? 0}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(bank)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <EditIcon />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(bank)}
                        disabled={deletingId === bank.id}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingId === bank.id ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <DeleteIcon />
                        )}
                        Delete
                      </button>
                      <Link
                        href={`/dashboard/subjects/${subjectId}/modules/${moduleId}/banks/${bank.id}/questions`}
                        className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                      >
                        Manage Questions
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete question bank"
        message={`Delete question bank "${pendingDelete?.name ?? ""}"?`}
        loading={Boolean(deletingId)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
