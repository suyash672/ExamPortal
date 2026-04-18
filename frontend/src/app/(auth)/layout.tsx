export default function AuthLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-8">
        {children}
      </section>
    </main>
  );
}
