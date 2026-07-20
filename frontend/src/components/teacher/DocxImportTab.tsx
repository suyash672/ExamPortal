"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { getApiErrorMessage } from "@/lib/apiError";
import { analyzeDocxFile, commitDocxImport, type DocxPreviewItem, type DocxPreviewResponse } from "@/lib/api/questions";

type Props = {
  qbId: string;
  previewData: DocxPreviewResponse | null;
  setPreviewData: (data: DocxPreviewResponse | null) => void;
  items: Array<DocxPreviewItem & { importType: "MCQ_TEXT" | "MCQ_IMAGE" }>;
  setItems: React.Dispatch<React.SetStateAction<Array<DocxPreviewItem & { importType: "MCQ_TEXT" | "MCQ_IMAGE" }>>>;
  onImportComplete: () => void;
};

export function DocxImportTab({
  qbId,
  previewData,
  setPreviewData,
  items,
  setItems,
  onImportComplete
}: Props) {
  const { showToast } = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isProgressHidden, setIsProgressHidden] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    active: boolean;
    current: number;
    total: number;
    statusText: string;
  }>({
    active: false,
    current: 0,
    total: 0,
    statusText: ""
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith(".docx")) {
        showToast("Please select a valid .docx file", "error");
        return;
      }
      setSelectedFile(file);
      setPreviewData(null);
      setItems([]);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      showToast("Please select a .docx file first", "error");
      return;
    }

    setAnalyzing(true);
    try {
      const result = await analyzeDocxFile(qbId, selectedFile);
      setPreviewData(result);

      const itemsWithTypes = result.questions.map((q) => ({
        ...q,
        importType: q.suggestedType
      }));
      setItems(itemsWithTypes);
      showToast(`Analyzed ${result.totalQuestions} questions successfully!`);
    } catch (err: any) {
      showToast(getApiErrorMessage(err, "Failed to analyze .docx file"), "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleToggleItemType = (tempId: string, newType: "MCQ_TEXT" | "MCQ_IMAGE") => {
    setItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, importType: newType } : item))
    );
  };

  const handleBulkSetType = (type: "MCQ_TEXT" | "MCQ_IMAGE" | "RESET") => {
    if (!previewData) return;
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        importType: type === "RESET" ? item.suggestedType : type
      }))
    );
  };

  const handleCommitImport = async () => {
    if (items.length === 0) return;

    setImporting(true);
    setIsProgressHidden(false);
    setImportProgress({
      active: true,
      current: 0,
      total: items.length,
      statusText: `Preparing batch import for ${items.length} questions...`
    });

    const BATCH_SIZE = 2;
    let importedTotal = 0;

    try {
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const chunk = items.slice(i, i + BATCH_SIZE);
        const currentNum = Math.min(i + BATCH_SIZE, items.length);

        setImportProgress({
          active: true,
          current: currentNum,
          total: items.length,
          statusText: `Rendering & importing questions ${i + 1} to ${currentNum} of ${items.length}...`
        });

        const res = await commitDocxImport(qbId, chunk);
        importedTotal += res.importedCount;
      }

      showToast(`Successfully imported all ${importedTotal} questions!`);
      setPreviewData(null);
      setItems([]);
      setSelectedFile(null);
      onImportComplete();
    } catch (err: any) {
      showToast(getApiErrorMessage(err, "Failed to import questions"), "error");
    } finally {
      setImporting(false);
      setImportProgress({ active: false, current: 0, total: 0, statusText: "" });
      setIsProgressHidden(false);
    }
  };

  const imageCardCount = items.filter((i) => i.importType === "MCQ_IMAGE").length;
  const pureTextCount = items.filter((i) => i.importType === "MCQ_TEXT").length;
  const progressPercent = importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0;

  return (
    <div className="space-y-6 relative">
      {/* Live Progress Modal */}
      {importProgress.active && !isProgressHidden && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 font-extrabold text-lg animate-pulse">
                  ⚡
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Importing & Rendering Questions</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{importProgress.statusText}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-extrabold text-teal-700 border border-teal-200">
                  {progressPercent}%
                </span>
                <button
                  type="button"
                  onClick={() => setIsProgressHidden(true)}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                  title="Hide progress and run in background"
                >
                  Hide ✕
                </button>
              </div>
            </div>

            {/* Progress Bar Track */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Rendering Progress</span>
                <span className="font-mono text-teal-700">
                  {importProgress.current} / {importProgress.total} Questions
                </span>
              </div>
              <div className="h-4 w-full overflow-hidden rounded-full bg-slate-100 p-0.5 border border-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-400 transition-all duration-500 ease-out shadow-sm"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2 text-[11.5px] font-semibold text-slate-500">
                <span className="h-2 w-2 rounded-full bg-teal-500 animate-ping" />
                Rendering equation cards...
              </div>
              <button
                type="button"
                onClick={() => setIsProgressHidden(true)}
                className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
              >
                Hide & keep rendering in background →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Minimize Pill when Progress is Hidden */}
      {importProgress.active && isProgressHidden && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-teal-200 bg-white p-3.5 shadow-2xl">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600 font-extrabold text-sm animate-pulse">
            ⚡
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900">
              Importing ({progressPercent}%)
            </p>
            <p className="text-[11px] text-slate-500 font-mono">
              {importProgress.current} / {importProgress.total} Questions
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsProgressHidden(false)}
            className="ml-2 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-teal-500 transition cursor-pointer"
          >
            Show Progress
          </button>
        </div>
      )}

      {/* File Select & Upload Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">📄 Smart DOCX Importer</h2>
            <p className="text-xs text-slate-500 mt-1">
              Upload any Word document containing questions. The system automatically detects equations, fractions, and diagrams to suggest high-resolution Image Card rendering.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="cursor-pointer rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition">
              {selectedFile ? selectedFile.name : "Select .docx File"}
              <input type="file" accept=".docx" onChange={handleFileChange} className="hidden" />
            </label>

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!selectedFile || analyzing}
              className="rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-teal-500 disabled:opacity-50 transition cursor-pointer"
            >
              {analyzing ? "Analyzing Document..." : "🔍 Analyze Document"}
            </button>
          </div>
        </div>
      </div>

      {/* Analysis Preview & Override Panel */}
      {previewData && items.length > 0 && (
        <div className="space-y-4">
          {/* Smart Analysis Summary Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase text-slate-400">Total Questions</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{items.length}</p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase text-emerald-700">🟢 Pure Text Questions</p>
              <p className="text-2xl font-extrabold text-emerald-900 mt-1">{pureTextCount}</p>
              <p className="text-[11px] text-emerald-600 mt-1">Imported as standard selectable text</p>
            </div>

            <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 shadow-sm">
              <p className="text-xs font-bold uppercase text-teal-700">🖼️ Image Card Questions</p>
              <p className="text-2xl font-extrabold text-teal-900 mt-1">{imageCardCount}</p>
              <p className="text-[11px] text-teal-600 mt-1">Rendered with dynamic auto-crop height</p>
            </div>
          </div>

          {/* Quick Override Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Bulk Actions:</span>
              <button
                type="button"
                onClick={() => handleBulkSetType("MCQ_IMAGE")}
                className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100 transition cursor-pointer"
              >
                Force All to Image Cards
              </button>
              <button
                type="button"
                onClick={() => handleBulkSetType("MCQ_TEXT")}
                className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                Force All to Text
              </button>
              <button
                type="button"
                onClick={() => handleBulkSetType("RESET")}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Reset Auto Suggestions
              </button>
            </div>

            <button
              type="button"
              onClick={handleCommitImport}
              disabled={importing}
              className="rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-teal-500 disabled:opacity-50 transition cursor-pointer"
            >
              {importing ? "Importing & Rendering..." : `🚀 Import ${items.length} Questions Now`}
            </button>
          </div>

          {/* Detailed Question Preview Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="sticky top-0 bg-slate-100 font-bold uppercase text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 w-16">Q #</th>
                    <th className="px-4 py-3">Question Content & Options Preview</th>
                    <th className="px-4 py-3 w-44">Auto-Detected</th>
                    <th className="px-4 py-3 w-56">Render Mode Selection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={item.tempId} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 font-bold text-slate-900">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900" dangerouslySetInnerHTML={{ __html: item.questionText }} />
                        <div className="mt-1 text-[11px] text-slate-500 flex flex-wrap gap-2">
                          {Object.keys(item.options || {}).map((key) => (
                            <span key={key} className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              <strong>{key}:</strong> {item.options[key]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {item.hasEquation ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-bold text-amber-800 border border-amber-200">
                            ⚡ Math / Symbols
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                            📝 Standard Text
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-100">
                          <button
                            type="button"
                            onClick={() => handleToggleItemType(item.tempId, "MCQ_TEXT")}
                            className={`rounded-lg px-3 py-1 font-bold transition cursor-pointer ${
                              item.importType === "MCQ_TEXT"
                                ? "bg-white text-slate-900 shadow-xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Text
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleItemType(item.tempId, "MCQ_IMAGE")}
                            className={`rounded-lg px-3 py-1 font-bold transition cursor-pointer ${
                              item.importType === "MCQ_IMAGE"
                                ? "bg-teal-600 text-white shadow-xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Image Card
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
