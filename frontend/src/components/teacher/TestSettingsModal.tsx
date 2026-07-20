"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  getTestStatistics,
  updateTestSettings,
  type TestListItem,
  type TestStatistics
} from "@/lib/api/tests";

type Props = {
  open: boolean;
  test: TestListItem | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
};

export function TestSettingsModal({ open, test, onOpenChange, onUpdated }: Props) {
  const { showToast } = useToast();

  const [stats, setStats] = useState<TestStatistics | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [isLocked, setIsLocked] = useState(false);
  const [resultsReveal, setResultsReveal] = useState(true);
  const [saveAttempts, setSaveAttempts] = useState(true);

  const [useFullscreen, setUseFullscreen] = useState(false);
  const [logActivities, setLogActivities] = useState(false);
  const [preventCopyPaste, setPreventCopyPaste] = useState(false);
  const [infiniteTries, setInfiniteTries] = useState(false);

  useEffect(() => {
    if (open && test) {
      setTitle(test.title);
      setEnrollmentKey(test.enrollmentKey ?? "");
      setDurationMinutes(test.durationMinutes);
      setStartTime(test.startTime ? new Date(test.startTime).toISOString().slice(0, 16) : "");
      setEndTime(test.endTime ? new Date(test.endTime).toISOString().slice(0, 16) : "");

      setIsLocked(test.isLocked);
      setResultsReveal(test.resultsReveal ?? true);
      setSaveAttempts(test.saveAttempts ?? true);

      setUseFullscreen(test.useFullscreen ?? false);
      setLogActivities(test.logActivities ?? false);
      setPreventCopyPaste(test.preventCopyPaste ?? false);
      setInfiniteTries(test.infiniteTries ?? false);

      void fetchStats(test.id);
    }
  }, [open, test]);

  const fetchStats = async (testId: string) => {
    setLoadingStats(true);
    try {
      const data = await getTestStatistics(testId);
      setStats(data);
    } catch {
      // Non-blocking error
    } finally {
      setLoadingStats(false);
    }
  };

  if (!open || !test) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTestSettings(test.id, {
        title: title.trim(),
        enrollmentKey: enrollmentKey.trim() || null,
        durationMinutes: Number(durationMinutes),
        startTime: startTime ? new Date(startTime).toISOString() : test.startTime,
        endTime: endTime ? new Date(endTime).toISOString() : test.endTime,
        isLocked,
        resultsReveal,
        saveAttempts,
        useFullscreen,
        logActivities,
        preventCopyPaste,
        infiniteTries
      });

      showToast("Test settings updated successfully!");
      onUpdated();
      onOpenChange(false);
    } catch (err: any) {
      showToast(getApiErrorMessage(err, "Failed to update test settings"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚙️</span>
              <h2 className="text-xl font-bold text-slate-900">Test Configurations & Settings</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Configure live proctoring, student visibility, result release options, and view real-time student attempt analytics.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            ✕
          </button>
        </div>

        {/* SECTION 1: Real-Time Live Analytics */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <span>📊 Real-Time Student Attempt Statistics</span>
            </h3>
            <button
              type="button"
              onClick={() => void fetchStats(test.id)}
              className="text-[11px] font-semibold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
            >
              🔄 {loadingStats ? "Refreshing..." : "Refresh Stats"}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
              <p className="text-[11px] font-bold text-emerald-800 uppercase">🟢 Attempted</p>
              <p className="text-2xl font-extrabold text-emerald-950 mt-0.5">
                {stats?.attemptedCount ?? 0}
              </p>
              <p className="text-[10px] text-emerald-700">Submitted scorecards</p>
            </div>

            <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3">
              <p className="text-[11px] font-bold text-teal-800 uppercase">⚡ Attempting Live</p>
              <p className="text-2xl font-extrabold text-teal-950 mt-0.5">
                {stats?.attemptingCount ?? 0}
              </p>
              <p className="text-[10px] text-teal-700">Currently taking test</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase">⚪ Enrolled (Pending)</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
                {stats?.notAttemptedCount ?? 0}
              </p>
              <p className="text-[10px] text-slate-500">Not started yet</p>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
              <p className="text-[11px] font-bold text-sky-800 uppercase">📈 Avg / High Score</p>
              <p className="text-xl font-extrabold text-sky-950 mt-0.5">
                {stats?.averageScore ?? 0} / {stats?.highestScore ?? 0}
              </p>
              <p className="text-[10px] text-sky-700">Out of {stats?.totalMarks ?? test.totalMarks} marks</p>
            </div>
          </div>
        </div>

        {/* SECTION 2: Student Visibility & Result Controls */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            👁️ Visibility & Student Controls
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Make Visible / Lock Toggle */}
            <label className={`cursor-pointer rounded-2xl border p-4 transition flex flex-col justify-between ${
              !isLocked ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-slate-50"
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Visible to Students</span>
                <input
                  type="checkbox"
                  checked={!isLocked}
                  onChange={(e) => setIsLocked(!e.target.checked)}
                  className="h-4 w-4 rounded accent-teal-600 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {!isLocked ? "🟢 Unlocked: Students can view & take test" : "🔒 Locked: Hidden from student list"}
              </p>
            </label>

            {/* Reveal Results */}
            <label className={`cursor-pointer rounded-2xl border p-4 transition flex flex-col justify-between ${
              resultsReveal ? "border-teal-300 bg-teal-50/40" : "border-slate-200 bg-slate-50"
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Reveal Results</span>
                <input
                  type="checkbox"
                  checked={resultsReveal}
                  onChange={(e) => setResultsReveal(e.target.checked)}
                  className="h-4 w-4 rounded accent-teal-600 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {resultsReveal ? "🔓 Show scorecards & answer keys" : "🔒 Hide scorecards from students"}
              </p>
            </label>

            {/* Store Student Data */}
            <label className={`cursor-pointer rounded-2xl border p-4 transition flex flex-col justify-between ${
              saveAttempts ? "border-teal-300 bg-teal-50/40" : "border-slate-200 bg-slate-50"
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Store Student Data</span>
                <input
                  type="checkbox"
                  checked={saveAttempts}
                  onChange={(e) => setSaveAttempts(e.target.checked)}
                  className="h-4 w-4 rounded accent-teal-600 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {saveAttempts ? "💾 Persist attempts & log activity data" : "⚠️ Do not store detailed attempt logs"}
              </p>
            </label>
          </div>
        </div>

        {/* SECTION 3: Live Proctoring & Security */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            🔒 Live Proctoring & Exam Security
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 hover:bg-slate-50 transition flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">📺 Force Fullscreen Mode</p>
                <p className="text-[11px] text-slate-500">Requires browser full screen during exam</p>
              </div>
              <input
                type="checkbox"
                checked={useFullscreen}
                onChange={(e) => setUseFullscreen(e.target.checked)}
                className="h-4 w-4 rounded accent-teal-600 cursor-pointer"
              />
            </label>

            <label className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 hover:bg-slate-50 transition flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">📜 Log Tab Switches & Blur</p>
                <p className="text-[11px] text-slate-500">Track focus loss & window blur logs</p>
              </div>
              <input
                type="checkbox"
                checked={logActivities}
                onChange={(e) => setLogActivities(e.target.checked)}
                className="h-4 w-4 rounded accent-teal-600 cursor-pointer"
              />
            </label>

            <label className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 hover:bg-slate-50 transition flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">🚫 Disable Copy / Paste</p>
                <p className="text-[11px] text-slate-500">Block right-click & text selection</p>
              </div>
              <input
                type="checkbox"
                checked={preventCopyPaste}
                onChange={(e) => setPreventCopyPaste(e.target.checked)}
                className="h-4 w-4 rounded accent-teal-600 cursor-pointer"
              />
            </label>

            <label className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 hover:bg-slate-50 transition flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">🔄 Allow Infinite Tries</p>
                <p className="text-[11px] text-slate-500">Students can retake test multiple times</p>
              </div>
              <input
                type="checkbox"
                checked={infiniteTries}
                onChange={(e) => setInfiniteTries(e.target.checked)}
                className="h-4 w-4 rounded accent-teal-600 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* SECTION 4: Edit Details */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            ✏️ Edit Test Schedule & Key
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700">Test Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">Enrollment Key</label>
              <input
                type="text"
                value={enrollmentKey}
                onChange={(e) => setEnrollmentKey(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                placeholder="e.g. res-dft-c"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">Start Time</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">End Time</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-xl bg-teal-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-teal-500 disabled:opacity-50 transition cursor-pointer"
          >
            {saving ? "Saving..." : "💾 Save Configurations"}
          </button>
        </div>
      </div>
    </div>
  );
}
