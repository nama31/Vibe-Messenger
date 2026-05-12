"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import { useAuthStore } from "../../../store/authStore";
import type { User } from "../../../types";

interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}

const USERNAME_RE = /^[a-z0-9_]+$/;

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (username.length < 3) {
      errs.username = "At least 3 characters required.";
    } else if (!USERNAME_RE.test(username)) {
      errs.username = "Only lowercase letters, numbers, and underscores.";
    }

    if (!email.includes("@")) {
      errs.email = "Enter a valid email address.";
    }

    if (password.length < 8) {
      errs.password = "At least 8 characters required.";
    }

    if (displayName.trim().length < 1) {
      errs.displayName = "Display name cannot be empty.";
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setLoading(true);
    try {
      const data = await apiFetch<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username,
          email,
          password,
          display_name: displayName.trim(),
        }),
      });
      setAuth(data.user, data.access_token, data.refresh_token);
      router.replace("/");
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        setError("Username or email is already taken.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="w-full max-w-sm rounded-2xl p-8 shadow-sm"
      style={{ backgroundColor: "var(--bg-sidebar)" }}
    >
      <h1
        className="mb-6 text-xl font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        Create account
      </h1>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {/* Display name */}
        <Field
          id="displayName"
          label="Display name"
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={setDisplayName}
          placeholder="Айзат"
          error={fieldErrors.displayName}
        />

        {/* Username */}
        <Field
          id="username"
          label="Username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(v) => setUsername(v.toLowerCase())}
          placeholder="aizat_k"
          hint="Lowercase letters, numbers, underscores"
          error={fieldErrors.username}
        />

        {/* Email */}
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          error={fieldErrors.email}
        />

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg px-4 py-2 pr-10 text-sm outline-none
                         border transition-colors duration-150
                         focus:ring-2 focus:ring-[var(--text-secondary)]/40"
              style={{
                backgroundColor: "var(--bg-page)",
                borderColor: fieldErrors.password ? "#c0392b" : "var(--border)",
                color: "var(--text-primary)",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-secondary)" }}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
          {fieldErrors.password && (
            <p className="text-xs" style={{ color: "#c0392b" }}>{fieldErrors.password}</p>
          )}
        </div>

        {/* Global error */}
        {error && (
          <p
            className="text-sm rounded-lg px-3 py-2"
            style={{ color: "#c0392b", backgroundColor: "rgba(192,57,43,0.08)" }}
            role="alert"
          >
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="mt-1 rounded-lg px-4 py-2.5 text-sm font-medium
                     transition-opacity duration-150
                     disabled:opacity-50 disabled:cursor-not-allowed
                     hover:opacity-90 active:opacity-80"
          style={{
            backgroundColor: "var(--text-primary)",
            color: "var(--bg-page)",
          }}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      {/* Link to login */}
      <p
        className="mt-5 text-center text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--text-primary)" }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

// ── Reusable field component (local to this file) ─────────────────────────

function Field({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  placeholder,
  hint,
  error,
}: {
  id: string;
  label: string;
  type: string;
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg px-4 py-2 text-sm outline-none
                   border transition-colors duration-150
                   focus:ring-2 focus:ring-[var(--text-secondary)]/40"
        style={{
          backgroundColor: "var(--bg-page)",
          borderColor: error ? "#c0392b" : "var(--border)",
          color: "var(--text-primary)",
        }}
      />
      {hint && !error && (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{hint}</p>
      )}
      {error && (
        <p className="text-xs" style={{ color: "#c0392b" }}>{error}</p>
      )}
    </div>
  );
}
