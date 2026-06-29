"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { importQuestionsCsv, importQuestionsMoodleHtml, importQuestionsDocx, type CsvImportError } from "@/lib/api/questions";
import { useToast } from "@/components/ui/ToastProvider";

type CsvImportTabProps = {
  qbId: string;
  onImported?: () => void;
};

const sampleCsv = `type,question_text,option_1_text,option_1_score,option_2_text,option_2_score,option_3_text,option_3_score,option_4_text,option_4_score,option_5_text,option_5_score,option_6_text,option_6_score,accepted_answer_1,accepted_answer_2,accepted_answer_3,accepted_answer_4,accepted_answer_5
MCQ,Which planet is known as the Red Planet?,Mars,100,Earth,0,,,,,,,,,,,
TEXT,Name the capital city of France.,,,,,,,,,,,,,,Paris,PARIS,,`;

export function CsvImportTab({ qbId, onImported }: CsvImportTabProps) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<CsvImportError[]>([]);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const canUpload = Boolean(file) && !loading;

  const selectedLabel = useMemo(() => file?.name ?? "No file selected", [file]);

  const handleDownloadTemplate = () => {
    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "question-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setErrors([]);
    setImportedCount(null);
  };

  const handleUpload = async () => {
    if (!file) {
      showToast("Choose a CSV file first", "error");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("qbId", qbId);

    setLoading(true);
    setErrors([]);
    setImportedCount(null);

    try {
      if (file.name.toLowerCase().endsWith(".html")) {
        const response = await importQuestionsMoodleHtml(formData);
        setImportedCount(response.imported);
        if (response.warnings && response.warnings.length > 0) {
          showToast(`Imported ${response.imported} questions with ${response.warnings.length} warnings. First option is set to 100% by default.`, "error");
        } else {
          showToast(`Imported ${response.imported} questions. First option is set to 100% by default.`);
        }
      } else if (file.name.toLowerCase().endsWith(".docx")) {
        const response = await importQuestionsDocx(formData);
        setImportedCount(response.imported);
        if (response.warnings && response.warnings.length > 0) {
          showToast(`Imported ${response.imported} questions with ${response.warnings.length} warnings.`, "error");
        } else {
          showToast(`Imported ${response.imported} questions successfully from Word document.`);
        }
      } else {
        const response = await importQuestionsCsv(formData);
        setImportedCount(response.imported);
        showToast(`Imported ${response.imported} questions`);
      }
      
      
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      
      if (onImported) {
        onImported();
      }
    } catch (error: any) {
      const responseErrors = error?.response?.data?.errors;
      if (Array.isArray(responseErrors)) {
        setErrors(responseErrors);
      } else {
        showToast("Failed to import file", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Import questions from CSV, Moodle HTML, or Word</h3>
          <p className="mt-1 text-sm text-slate-500">
            Upload a CSV file, a Moodle XHTML Export file, or a Word (.docx) file to import questions.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Download template
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="csv-file">
            Import file
          </label>
          <input
            ref={inputRef}
            id="csv-file"
            type="file"
             accept=".csv,text/csv,.html,text/html,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
          <p className="text-xs text-slate-500">{selectedLabel}</p>
        </div>

        <button
          type="button"
          disabled={!canUpload}
          onClick={() => void handleUpload()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : null}
          {loading ? "Uploading..." : "Upload & Validate"}
        </button>
      </div>

      {errors.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-rose-200">
          <table className="min-w-full divide-y divide-rose-200">
            <thead className="bg-rose-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-rose-900">Row</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-rose-900">Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-100 bg-white">
              {errors.map((error) => (
                <tr key={error.row}>
                  <td className="px-4 py-3 text-sm font-medium text-rose-900">{error.row}</td>
                  <td className="px-4 py-3 text-sm text-rose-800">
                    <ul className="list-disc space-y-1 pl-5">
                      {error.errors.map((message, index) => (
                        <li key={`${error.row}-${index}`}>{message}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {importedCount !== null ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Imported {importedCount} questions successfully.
        </div>
      ) : null}
    </div>
  );
}
