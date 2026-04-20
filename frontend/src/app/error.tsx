"use client";

export default function GlobalError({
  _error,
  reset
}: {
  _error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--danger)]">Something went wrong</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Unexpected error</h1>
        <p className="mt-3 text-sm text-slate-500">Please try again. If the issue continues, refresh the page.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)]"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
