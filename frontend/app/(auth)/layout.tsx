"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../store/authStore";

/**
 * Shared layout for /login and /register.
 * - Redirects already-authenticated users straight to the chat.
 * - Provides the full-screen centered background.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const access_token = useAuthStore((s) => s.access_token);

  useEffect(() => {
    if (access_token) {
      router.replace("/");
    }
  }, [access_token, router]);

  // Don't flash the form if the user is already logged in
  if (access_token) return null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: "var(--bg-page)" }}
    >
      {/* App name above the card */}
      <p
        className="mb-6 text-2xl font-semibold tracking-tight"
        style={{ color: "var(--text-primary)" }}
      >
        Vibe
      </p>

      {children}
    </div>
  );
}
