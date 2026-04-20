export function PageLoader() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-56 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-80 animate-pulse rounded bg-slate-100" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
    </div>
  );
}
