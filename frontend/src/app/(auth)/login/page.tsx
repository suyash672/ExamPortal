"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../../../context/AuthContext";

import { useState } from "react";

const loginFormSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
  role: z.enum(["STUDENT", "TEACHER"])
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, loading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
      role: "STUDENT"
    }
  });

  const selectedRole = watch("role");

  const onSubmit = async (values: LoginFormValues) => {
    try {
      const signedInUser = await login(values.email, values.password, values.role);
      router.push(signedInUser.role === "TEACHER" ? "/dashboard" : "/tests");
    } catch {
      setError("root", {
        message: "Invalid email or password."
      });
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
          ExamShield
        </p>
        <h1 className="text-2xl font-semibold">Sign in to your account</h1>
        <p className="text-sm text-[var(--muted)]">
          Continue as a student or teacher.
        </p>
      </header>

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--surface-muted)] p-1">
          {[
            { label: "Student", value: "STUDENT" as const },
            { label: "Teacher", value: "TEACHER" as const }
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setValue("role", option.value, { shouldValidate: true })}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                selectedRole === option.value
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                  : "text-[var(--muted)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
            {...register("email")}
          />
          {errors.email ? (
            <p className="text-xs text-[var(--danger)]">{errors.email.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="w-full rounded-xl border border-[var(--border)] bg-white pl-3 pr-16 py-2.5 text-sm transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition cursor-pointer select-none"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "👁️ Hide" : "👁️ Show"}
            </button>
          </div>
          {errors.password ? (
            <p className="text-xs text-[var(--danger)]">{errors.password.message}</p>
          ) : null}
        </div>

        {errors.root?.message ? (
          <p className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 text-sm text-[var(--danger)]">
            {errors.root.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : null}
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-[var(--muted)]">
        New here?{" "}
        <Link href="/register" className="font-semibold text-[var(--primary)] hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
