"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../../../context/AuthContext";
import api from "../../../lib/axios";

const registerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(100),
    email: z.string().email("Enter a valid email address."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128),
    confirmPassword: z.string().min(1, "Please confirm your password."),
    role: z.enum(["STUDENT", "TEACHER"])
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match."
  });

type RegisterFormValues = z.infer<typeof registerFormSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { login, loading } = useAuth();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "STUDENT"
    }
  });

  const selectedRole = watch("role");

  const onSubmit = async (values: RegisterFormValues) => {
    try {
      await api.post("/api/auth/register", {
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role
      });

      const signedInUser = await login(values.email, values.password, values.role);
      router.push(signedInUser.role === "TEACHER" ? "/dashboard" : "/tests");
    } catch {
      setError("root", {
        message: "Could not create account. Please try again."
      });
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
          ExamShield
        </p>
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-sm text-[var(--muted)]">
          Join as a student or teacher.
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
          <label className="text-sm font-medium" htmlFor="name">
            Full name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
            {...register("name")}
          />
          {errors.name ? (
            <p className="text-xs text-[var(--danger)]">{errors.name.message}</p>
          ) : null}
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
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
            {...register("password")}
          />
          {errors.password ? (
            <p className="text-xs text-[var(--danger)]">{errors.password.message}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="confirmPassword">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm transition focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/30"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword ? (
            <p className="text-xs text-[var(--danger)]">
              {errors.confirmPassword.message}
            </p>
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
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
