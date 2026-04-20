"use client";

type ToastVariant = "success" | "error" | "info";

type ToastProps = {
  message: string;
  variant: ToastVariant;
  onClose: () => void;
};

export function Toast({ message, variant, onClose }: ToastProps) {
  const classes =
    variant === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : variant === "error"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : "border-sky-200 bg-sky-50 text-sky-900";

  return (
    <div role="status" className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${classes}`}>
      <div className="flex items-start justify-between gap-3">
        <p>{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-current/70 transition hover:bg-black/5 hover:text-current"
          aria-label="Dismiss toast"
        >
          ×
        </button>
      </div>
    </div>
  );
}
