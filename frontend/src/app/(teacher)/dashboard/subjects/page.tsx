"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SubjectModal } from "@/components/teacher/SubjectModal";
import { deleteSubject, getSubjects, type SubjectRecord } from "@/lib/api/subjects";
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

export default function SubjectsPage() {
  const { showToast } = useToast();
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<SubjectRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getSubjects();
      setSubjects(data);
    } catch {
      setError("Unable to load subjects. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  const handleDelete = async (subject: SubjectRecord) => {
    const confirmed = window.confirm(`Delete subject \"${subject.name}\"?`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(subject.id);
      await deleteSubject(subject.id);
      showToast("Subject deleted");
      await loadSubjects();
    } catch {
      showToast("Failed to delete subject", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaved = async () => {
    await loadSubjects();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
            Subjects
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Manage subjects</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Create and organize the subjects taught in your classes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSelectedSubject(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
        >
          New Subject
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-slate-900">No subjects yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Create your first subject to begin organizing modules.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <article key={subject.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-slate-900">{subject.name}</h2>
                  <p className="mt-1 line-clamp-3 text-sm text-slate-500">
                    {subject.description || "No description added yet."}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSubject(subject);
                      setModalOpen(true);
                    }}
                    className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    aria-label={`Edit ${subject.name}`}
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(subject)}
                    disabled={deletingId === subject.id}
                    className="rounded-xl p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={`Delete ${subject.name}`}
                  >
                    {deletingId === subject.id ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <DeleteIcon />
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span>Modules</span>
                <span className="font-semibold text-slate-900">{subject._count.modules}</span>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <Link
                  href={`/dashboard/subjects/${subject.id}/modules`}
                  className="text-sm font-semibold text-[var(--primary)] hover:underline"
                >
                  Manage modules
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubject(subject);
                    setModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <EditIcon />
                  Edit
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <SubjectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        subject={selectedSubject}
        onSaved={handleSaved}
      />
    </div>
  );
}
