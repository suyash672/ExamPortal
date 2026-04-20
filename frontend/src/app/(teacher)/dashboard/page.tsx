"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSubjects } from "@/lib/api/subjects";
import { getTests } from "@/lib/api/tests";

export default function DashboardPage() {
  const [subjectCount, setSubjectCount] = useState(0);
  const [testCount, setTestCount] = useState(0);
  const [activeTestCount, setActiveTestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [subjects, tests] = await Promise.all([getSubjects(), getTests()]);
      const now = Date.now();

      setSubjectCount(subjects.length);
      setTestCount(tests.length);
      setActiveTestCount(
        tests.filter((test) => {
          const start = new Date(test.startTime).getTime();
          const end = new Date(test.endTime).getTime();
          return now >= start && now <= end;
        }).length
      );
    } catch {
      setError("Unable to load dashboard metrics. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const cards = useMemo(
    () => [
      { label: "Total Subjects", value: subjectCount },
      { label: "Total Tests", value: testCount },
      { label: "Active Tests", value: activeTestCount }
    ],
    [activeTestCount, subjectCount, testCount]
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Overview</h1>
        <p className="mt-2 text-sm text-slate-500">Track your current content and test activity at a glance.</p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{loading ? "..." : card.value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quick Actions</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/dashboard/subjects"
            className="inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
          >
            Create Subject
          </Link>
          <Link
            href="/dashboard/tests/new"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Create Test
          </Link>
        </div>
      </section>
    </div>
  );
}
