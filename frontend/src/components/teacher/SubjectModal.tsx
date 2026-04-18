"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createSubject, updateSubject, type SubjectRecord } from "@/lib/api/subjects";
import { useToast } from "@/components/ui/ToastProvider";

const subjectFormSchema = z.object({
  name: z.string().trim().min(1, "Subject name is required.").max(100),
  description: z.string().trim().max(500).optional()
});

type SubjectFormValues = z.infer<typeof subjectFormSchema>;

type SubjectModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject?: SubjectRecord | null;
  onSaved: () => Promise<void> | void;
};

export function SubjectModal({ open, onOpenChange, subject, onSaved }: SubjectModalProps) {
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: {
      name: "",
      description: ""
    }
  });

  useEffect(() => {
    if (!open) {
      reset({ name: "", description: "" });
      return;
    }

    reset({
      name: subject?.name ?? "",
      description: subject?.description ?? ""
    });
  }, [open, reset, subject]);

  const onSubmit = async (values: SubjectFormValues) => {
    try {
      if (subject) {
        await updateSubject(subject.id, values);
        showToast("Subject updated");
      } else {
        await createSubject(values);
        showToast("Subject created");
      }

      await onSaved();
      onOpenChange(false);
    } catch {
      setError("root", {
        message: "Unable to save subject. Please try again."
      });
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
              {subject ? "Edit subject" : "New subject"}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              {subject ? "Update subject details" : "Create a subject"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="subject-name">
              Subject name
            </label>
            <input
              id="subject-name"
              type="text"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-xs text-[var(--danger)]">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="subject-description">
              Description
            </label>
            <textarea
              id="subject-description"
              rows={4}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              {...register("description")}
            />
            {errors.description ? (
              <p className="text-xs text-[var(--danger)]">{errors.description.message}</p>
            ) : null}
          </div>

          {errors.root?.message ? (
            <p className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 text-sm text-[var(--danger)]">
              {errors.root.message}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : null}
              {isSubmitting ? "Saving..." : subject ? "Update subject" : "Create subject"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
