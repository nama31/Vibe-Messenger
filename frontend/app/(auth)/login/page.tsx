"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { User } from "@/types";

interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAuth(data.user, data.access_token, data.refresh_token);
      router.replace("/");
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        setError("No account found with that email.");
      } else if (status === 401) {
        setError("Incorrect password.");
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
        Sign in
      </h1>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-lg px-4 py-2 text-sm outline-none
                       border transition-colors duration-150
                       focus:ring-2 focus:ring-[var(--text-secondary)]/40"
            style={{
              backgroundColor: "var(--bg-page)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg px-4 py-2 pr-10 text-sm outline-none
                         border transition-colors duration-150
                         focus:ring-2 focus:ring-[var(--text-secondary)]/40"
              style={{
                backgroundColor: "var(--bg-page)",
                borderColor: "var(--border)",
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
                /* Eye-off icon */
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                /* Eye icon */
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Inline error */}
        {error && (
          <p
            className="text-sm rounded-lg px-3 py-2"
            style={{
              color: "#c0392b",
              backgroundColor: "rgba(192,57,43,0.08)",
            }}
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
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {/* Link to register */}
      <p
        className="mt-5 text-center text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        No account?{" "}
        <Link
          href="/register"
          className="font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--text-primary)" }}
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
