"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  createModule,
  updateModule,
  type ModuleRecord
} from "@/lib/api/modules";
import { createQuestionBank } from "@/lib/api/questionbanks";
import { useToast } from "@/components/ui/ToastProvider";

const moduleFormSchema = z.object({
  name: z.string().trim().min(1, "Module name is required.").max(100)
});

type ModuleFormValues = z.infer<typeof moduleFormSchema>;

type ModuleFormProps = {
  subjectId: string;
  module?: ModuleRecord | null;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
};

export function ModuleForm({ subjectId, module, onSaved, onCancel }: ModuleFormProps) {
  const { showToast } = useToast();
  const [newQbName, setNewQbName] = useState("");
  const [isAddingQb, setIsAddingQb] = useState(false);
  const [qbError, setQbError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<ModuleFormValues>({
    resolver: zodResolver(moduleFormSchema),
    defaultValues: {
      name: ""
    }
  });

  useEffect(() => {
    reset({
      name: module?.name ?? ""
    });
  }, [module, reset]);

  const onSubmit = async (values: ModuleFormValues) => {
    try {
      if (module) {
        await updateModule(module.id, values);
        showToast("Module updated");
      } else {
        await createModule(subjectId, values);
        showToast("Module created");
      }

      await onSaved();
      if (!module) {
        reset({ name: "" });
      }
      onCancel();
    } catch {
      setError("root", {
        message: "Unable to save module. Please try again."
      });
    }
  };

  const handleAddQb = async () => {
    if (!module) return;
    const trimmed = newQbName.trim();
    if (!trimmed) {
      setQbError("Question bank name is required");
      return;
    }
    
    try {
      setIsAddingQb(true);
      setQbError(null);
      await createQuestionBank(module.id, { name: trimmed });
      showToast("Question bank added");
      setNewQbName("");
      await onSaved(); 
    } catch (e) {
      setQbError("Failed to create question bank");
    } finally {
      setIsAddingQb(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
            {module ? "Edit module" : "Add module"}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            {module ? "Update module details" : "Create a new module"}
          </h3>
        </div>
        {module ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Cancel edit"
          >
            ×
          </button>
        ) : null}
      </div>

      <form className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="module-name">
            Module name
          </label>
          <input
            id="module-name"
            type="text"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
            {...register("name")}
          />
          {errors.name ? (
            <p className="text-xs text-[var(--danger)]">{errors.name.message}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 md:pt-6">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : null}
            {isSubmitting ? "Saving..." : module ? "Update module" : "Add module"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>

        {errors.root?.message ? (
          <p className="md:col-span-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 text-sm text-[var(--danger)]">
            {errors.root.message}
          </p>
        ) : null}
      </form>

      {module ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Quick Add Question Bank</h4>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1 space-y-1.5">
              <input
                type="text"
                placeholder="Question bank name..."
                value={newQbName}
                onChange={(e) => setNewQbName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              />
              {qbError ? (
                <p className="text-xs text-[var(--danger)]">{qbError}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void handleAddQb()}
              disabled={isAddingQb}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAddingQb ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
