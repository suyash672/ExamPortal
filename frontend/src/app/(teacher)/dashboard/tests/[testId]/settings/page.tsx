"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  getTestById,
  getTestStatistics,
  updateTestSettings,
  type TestDetails,
  type TestStatistics
} from "@/lib/api/tests";

function normalizeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? "";
}

export default function TestSettingsPage() {
  const params = useParams<{ testId: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const testId = normalizeParam(params?.testId);

  const [test, setTest] = useState<TestDetails | null>(null);
  const [stats, setStats] = useState<TestStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingStats, setRefreshingStats] = useState(false);

  // Form state
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

  const loadData = useCallback(async () => {
    if (!testId) return;
    setLoading(true);
    try {
      const [testData, statsData] = await Promise.all([
        getTestById(testId),
        getTestStatistics(testId).catch(() => null)
      ]);

      setTest(testData);
      setStats(statsData);

      setTitle(testData.title);
      setEnrollmentKey(testData.enrollmentKey ?? "");
      setDurationMinutes(testData.durationMinutes);
      setStartTime(testData.startTime ? new Date(testData.startTime).toISOString().slice(0, 16) : "");
      setEndTime(testData.endTime ? new Date(testData.endTime).toISOString().slice(0, 16) : "");

      setIsLocked(testData.isLocked);
      setResultsReveal(testData.resultsReveal ?? true);
      setSaveAttempts(testData.saveAttempts ?? true);

      setUseFullscreen(testData.useFullscreen ?? false);
      setLogActivities(testData.logActivities ?? false);
      setPreventCopyPaste(testData.preventCopyPaste ?? false);
      setInfiniteTries(testData.infiniteTries ?? false);
    } catch (err: any) {
      showToast(getApiErrorMessage(err, "Failed to load test settings"), "error");
    } finally {
      setLoading(false);
    }
  }, [testId, showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefreshStats = async () => {
    if (!testId) return;
    setRefreshingStats(true);
    try {
      const statsData = await getTestStatistics(testId);
      setStats(statsData);
      showToast("Statistics refreshed!");
    } catch {
      showToast("Unable to refresh statistics", "error");
    } finally {
      setRefreshingStats(false);
    }
  };

  const handleSave = async () => {
    if (!testId) return;
    setSaving(true);
    try {
      await updateTestSettings(testId, {
        title: title.trim(),
        enrollmentKey: enrollmentKey.trim() || null,
        durationMinutes: Number(durationMinutes),
        startTime: startTime ? new Date(startTime).toISOString() : test?.startTime,
        endTime: endTime ? new Date(endTime).toISOString() : test?.endTime,
        isLocked,
        resultsReveal,
        saveAttempts,
        useFullscreen,
        logActivities,
        preventCopyPaste,
        infiniteTries
      });

      showToast("Test settings updated successfully!");
      router.push("/dashboard/tests");
    } catch (err: any) {
      showToast(getApiErrorMessage(err, "Failed to update test settings"), "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">
        Loading test configurations...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Header */}
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          <Link href="/dashboard/tests" className="font-medium text-[var(--primary)] hover:underline">
            Tests
          </Link>{" "}
          &gt;{" "}
          <span className="font-medium text-slate-900">{test?.title ?? "Test"}</span> &gt;{" "}
          <span className="font-medium text-slate-900">Settings</span>
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900">⚙️ Test Settings & Configurations</h1>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                !isLocked ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}>
                {!isLocked ? "🟢 Unlocked for Students" : "🔒 Locked"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Manage proctoring options, visibility toggles, student result rules, and live attempt analytics.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/tests"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              Cancel
            </Link>
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

      {/* SECTION 1: Real-Time Live Analytics */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
            <span>📊 Test Analytics & Performance Breakdown</span>
          </h2>
          <button
            type="button"
            onClick={handleRefreshStats}
            className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
          >
            🔄 {refreshingStats ? "Refreshing..." : "Refresh Live Stats"}
          </button>
        </div>

        {/* Tier 1: Overall Summary Cards */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Overall Performance Summary</p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-xs font-bold text-emerald-800 uppercase">🟢 Attempted</p>
              <p className="text-3xl font-extrabold text-emerald-950 mt-1">
                {stats?.attemptedCount ?? 0}
              </p>
              <p className="text-xs text-emerald-700 mt-1">Submitted scorecards</p>
            </div>

            <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
              <p className="text-xs font-bold text-teal-800 uppercase">⚡ Attempting Live</p>
              <p className="text-3xl font-extrabold text-teal-950 mt-1">
                {stats?.attemptingCount ?? 0}
              </p>
              <p className="text-xs text-teal-700 mt-1">Currently taking exam</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-bold text-slate-500 uppercase">⚪ Enrolled (Pending)</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">
                {stats?.notAttemptedCount ?? 0}
              </p>
              <p className="text-xs text-slate-500 mt-1">Not started yet</p>
            </div>

            <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <p className="text-xs font-bold text-sky-800 uppercase">📈 Average / High Score</p>
              <p className="text-2xl font-extrabold text-sky-950 mt-1">
                {stats?.averageScore ?? 0} / {stats?.highestScore ?? 0}
              </p>
              <p className="text-xs text-sky-700 mt-1">Out of {stats?.totalMarks ?? test?.totalMarks} total marks</p>
            </div>
          </div>
        </div>

        {/* Tier 2: Module-Wise Analytics */}
        <div className="space-y-3 pt-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">📘 Module-Wise Performance</p>
          {stats?.moduleStats && stats.moduleStats.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Module Name</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Questions</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Total Marks</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Class Avg Score</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Module Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.moduleStats.map((mod) => (
                    <tr key={mod.moduleId} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3.5 text-xs font-bold text-slate-900">{mod.moduleName}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">{mod.subjectName}</td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-slate-700">{mod.questionsPicked} Qs</td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-slate-700">{mod.totalMarks} marks</td>
                      <td className="px-4 py-3.5 text-xs font-bold text-teal-800">{mod.averageScore} / {mod.totalMarks}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full transition-all"
                              style={{ width: `${Math.min(100, mod.accuracyPercent)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-700">{mod.accuracyPercent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No module statistics available yet.</p>
          )}
        </div>

        {/* Tier 3: Question Bank & Difficulty-Wise Analytics */}
        <div className="space-y-3 pt-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">🎯 Question Bank & Difficulty Breakdown</p>
          {stats?.bankStats && stats.bankStats.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Question Bank</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Difficulty Level</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Module</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Questions & Weight</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Bank Max Marks</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Class Avg Score</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600">Bank Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.bankStats.map((bank) => (
                    <tr key={bank.qbId} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3.5 text-xs font-bold text-slate-900">{bank.qbName}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold capitalize ${
                          bank.difficulty.toLowerCase() === "easy"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : bank.difficulty.toLowerCase() === "medium"
                            ? "bg-sky-50 text-sky-800 border-sky-200"
                            : bank.difficulty.toLowerCase() === "complex"
                            ? "bg-purple-50 text-purple-800 border-purple-200"
                            : "bg-rose-50 text-rose-800 border-rose-200"
                        }`}>
                          {bank.difficulty}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">{bank.moduleName}</td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-slate-700">
                        {bank.questionsPicked} Qs ({bank.marksPerQuestion} mark/Q)
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold text-slate-700">{bank.totalMarks} marks</td>
                      <td className="px-4 py-3.5 text-xs font-bold text-teal-800">{bank.averageScore} / {bank.totalMarks}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full transition-all"
                              style={{ width: `${Math.min(100, bank.accuracyPercent)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-700">{bank.accuracyPercent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No question bank statistics available yet.</p>
          )}
        </div>
      </div>

      {/* SECTION 2: Student Visibility & Result Controls */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-3">
          👁️ Visibility & Student Controls
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className={`cursor-pointer rounded-2xl border p-5 transition flex flex-col justify-between ${
            !isLocked ? "border-emerald-300 bg-emerald-50/40 shadow-sm" : "border-slate-200 bg-slate-50"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">Make Visible to Students</span>
              <input
                type="checkbox"
                checked={!isLocked}
                onChange={(e) => setIsLocked(!e.target.checked)}
                className="h-5 w-5 rounded accent-teal-600 cursor-pointer"
              />
            </div>
            <p className="text-xs text-slate-500 mt-3">
              {!isLocked ? "🟢 Unlocked: Visible to students in portal" : "🔒 Locked: Hidden from student list"}
            </p>
          </label>

          <label className={`cursor-pointer rounded-2xl border p-5 transition flex flex-col justify-between ${
            resultsReveal ? "border-teal-300 bg-teal-50/40 shadow-sm" : "border-slate-200 bg-slate-50"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">Reveal Results</span>
              <input
                type="checkbox"
                checked={resultsReveal}
                onChange={(e) => setResultsReveal(e.target.checked)}
                className="h-5 w-5 rounded accent-teal-600 cursor-pointer"
              />
            </div>
            <p className="text-xs text-slate-500 mt-3">
              {resultsReveal ? "🔓 Show scorecards & answer keys after submit" : "🔒 Hide scorecards & correct answers"}
            </p>
          </label>

          <label className={`cursor-pointer rounded-2xl border p-5 transition flex flex-col justify-between ${
            saveAttempts ? "border-teal-300 bg-teal-50/40 shadow-sm" : "border-slate-200 bg-slate-50"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">Store Student Data</span>
              <input
                type="checkbox"
                checked={saveAttempts}
                onChange={(e) => setSaveAttempts(e.target.checked)}
                className="h-5 w-5 rounded accent-teal-600 cursor-pointer"
              />
            </div>
            <p className="text-xs text-slate-500 mt-3">
              {saveAttempts ? "💾 Persist attempts & log activity data" : "⚠️ Do not store detailed attempt logs"}
            </p>
          </label>
        </div>
      </div>

      {/* SECTION 3: Live Proctoring & Security Configurations */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-3">
          🔒 Live Proctoring & Exam Security
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50/50 p-4 hover:bg-slate-50 transition flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">📺 Force Fullscreen Mode</p>
              <p className="text-xs text-slate-500 mt-0.5">Requires browser full screen mode during test</p>
            </div>
            <input
              type="checkbox"
              checked={useFullscreen}
              onChange={(e) => setUseFullscreen(e.target.checked)}
              className="h-5 w-5 rounded accent-teal-600 cursor-pointer"
            />
          </label>

          <label className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50/50 p-4 hover:bg-slate-50 transition flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">📜 Log Tab Switches & Focus Loss</p>
              <p className="text-xs text-slate-500 mt-0.5">Track window blur events & focus loss logs</p>
            </div>
            <input
              type="checkbox"
              checked={logActivities}
              onChange={(e) => setLogActivities(e.target.checked)}
              className="h-5 w-5 rounded accent-teal-600 cursor-pointer"
            />
          </label>

          <label className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50/50 p-4 hover:bg-slate-50 transition flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">🚫 Disable Copy / Paste & Selection</p>
              <p className="text-xs text-slate-500 mt-0.5">Block right-click context menu & text selection</p>
            </div>
            <input
              type="checkbox"
              checked={preventCopyPaste}
              onChange={(e) => setPreventCopyPaste(e.target.checked)}
              className="h-5 w-5 rounded accent-teal-600 cursor-pointer"
            />
          </label>

          <label className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50/50 p-4 hover:bg-slate-50 transition flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">🔄 Allow Infinite Tries</p>
              <p className="text-xs text-slate-500 mt-0.5">Students can retake test multiple times</p>
            </div>
            <input
              type="checkbox"
              checked={infiniteTries}
              onChange={(e) => setInfiniteTries(e.target.checked)}
              className="h-5 w-5 rounded accent-teal-600 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* SECTION 4: Edit Schedule & Key */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-3">
          ✏️ Edit Test Schedule & Key
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-700">Test Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700">Enrollment Key</label>
            <input
              type="text"
              value={enrollmentKey}
              onChange={(e) => setEnrollmentKey(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              placeholder="e.g. res-dft-c"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700">Duration (Minutes)</label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700">Start Time</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700">End Time</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-3 pt-4">
        <Link
          href="/dashboard/tests"
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 transition"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-teal-600 px-8 py-3 text-sm font-bold text-white shadow-md hover:bg-teal-500 disabled:opacity-50 transition cursor-pointer"
        >
          {saving ? "Saving..." : "💾 Save Configurations"}
        </button>
      </div>
    </div>
  );
}
