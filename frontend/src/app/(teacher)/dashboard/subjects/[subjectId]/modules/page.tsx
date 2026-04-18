"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ModuleForm } from "@/components/teacher/ModuleForm";
import { useToast } from "@/components/ui/ToastProvider";
import { deleteModule, getModules, type ModuleRecord } from "@/lib/api/modules";
import { getSubjects, type SubjectRecord } from "@/lib/api/subjects";

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

export default function SubjectModulesPage() {
  const params = useParams<{ subjectId: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const subjectId = normalizeParam(params?.subjectId);

  const [subject, setSubject] = useState<SubjectRecord | null>(null);
  const [modules, setModules] = useState<ModuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingModule, setEditingModule] = useState<ModuleRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadModules = useCallback(async () => {
    if (!subjectId) {
      setError("Missing subject id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [subjectsData, modulesData] = await Promise.all([
        getSubjects(),
        getModules(subjectId)
      ]);
      setSubject(subjectsData.find((item) => item.id === subjectId) ?? null);
      setModules(modulesData);
    } catch {
      setError("Unable to load modules. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  const subjectName = useMemo(() => subject?.name ?? "Subject", [subject?.name]);

  const handleDelete = async (module: ModuleRecord) => {
    const confirmed = window.confirm(`Delete module \"${module.name}\"?`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(module.id);
      await deleteModule(module.id);
      showToast("Module deleted");
      await loadModules();
    } catch {
      showToast("Failed to delete module", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const startCreate = () => {
    setEditingModule(null);
    setShowForm(true);
  };

  const startEdit = (module: ModuleRecord) => {
    setEditingModule(module);
    setShowForm(true);
  };

  const handleSaved = async () => {
    await loadModules();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          <Link href="/dashboard/subjects" className="font-medium text-[var(--primary)] hover:underline">
            Subjects
          </Link>{" "}
          <span className="px-1 text-slate-300">&gt;</span>
          <span className="font-medium text-slate-900">{subjectName}</span>
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">{subjectName} modules</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Organize question banks and manage the module structure for this subject.
            </p>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
          >
            Add Module
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <ModuleForm
          subjectId={subjectId}
          module={editingModule}
          onSaved={handleSaved}
          onCancel={() => {
            setShowForm(false);
            setEditingModule(null);
          }}
        />
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
      ) : modules.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No modules yet</h2>
          <p className="mt-2 text-sm text-slate-500">Add the first module to start building question banks.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Module name
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  QB count
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modules.map((module) => (
                <tr key={module.id} className="transition hover:bg-slate-50/60">
                  <td className="px-5 py-4 text-sm font-medium text-slate-900">{module.name}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{module._count.questionBanks}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(module)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <EditIcon />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(module)}
                        disabled={deletingId === module.id}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingId === module.id ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <DeleteIcon />
                        )}
                        Delete
                      </button>
                      <Link
                        href={`/dashboard/subjects/${subjectId}/modules/${module.id}/banks`}
                        className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                      >
                        View QBs
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm ? null : (
        <div className="flex justify-start">
          <button
            type="button"
            onClick={() => router.push(`/dashboard/subjects/${subjectId}/modules`)}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
