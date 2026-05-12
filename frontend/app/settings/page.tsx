"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "../../store/authStore";
import { apiFetch } from "../../lib/api";
import type { User } from "../../types";

// ── Avatar preview ─────────────────────────────────────────────────────────

function AvatarPreview({
  url,
  displayName,
}: {
  url: string;
  displayName: string;
}) {
  const [imgError, setImgError] = useState(false);

  // Reset error state when URL changes
  useEffect(() => setImgError(false), [url]);

  const initials = displayName
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const showImg = url.trim() !== "" && !imgError;

  return (
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center
                 overflow-hidden shrink-0 text-xl font-semibold select-none"
      style={{
        backgroundColor: "var(--text-secondary)",
        color: "var(--bg-page)",
      }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={displayName}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        initials || "?"
      )}
    </div>
  );
}

// ── Settings page ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.access_token);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  if (!token || !user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    // Build only the fields that changed
    const patch: { display_name?: string; avatar_url?: string | null } = {};
    if (displayName.trim() !== user!.display_name) {
      patch.display_name = displayName.trim();
    }
    const newAvatar = avatarUrl.trim() === "" ? null : avatarUrl.trim();
    if (newAvatar !== (user!.avatar_url ?? null)) {
      patch.avatar_url = newAvatar;
    }

    // Nothing changed
    if (Object.keys(patch).length === 0) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }

    setSaving(true);
    try {
      const updated = await apiFetch<User>("/users/me", {
        method: "PATCH",
        token: token!,
        body: JSON.stringify(patch),
      });
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: "var(--bg-page)" }}
    >
      {/* Back link */}
      <div className="w-full max-w-sm mb-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm transition-colors duration-150"
          style={{ color: "var(--text-secondary)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to chats
        </Link>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-sm"
        style={{ backgroundColor: "var(--bg-sidebar)" }}
      >
        <h1
          className="mb-6 text-xl font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Profile settings
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Avatar preview + URL input */}
          <div className="flex flex-col gap-3">
            <label
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Avatar
            </label>

            {/* Preview */}
            <div className="flex items-center gap-4">
              <AvatarPreview
                url={avatarUrl}
                displayName={displayName || user.display_name}
              />
              <div className="flex-1 flex flex-col gap-1.5">
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none border
                             transition-colors duration-150
                             focus:ring-2 focus:ring-[var(--text-secondary)]/40"
                  style={{
                    backgroundColor: "var(--bg-page)",
                    borderColor: "var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                {avatarUrl.trim() !== "" && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl("")}
                    className="text-xs self-start transition-colors duration-150"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Remove avatar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Display name */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="display-name"
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Display name
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              required
              className="rounded-lg px-4 py-2 text-sm outline-none border
                         transition-colors duration-150
                         focus:ring-2 focus:ring-[var(--text-secondary)]/40"
              style={{
                backgroundColor: "var(--bg-page)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Read-only fields */}
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Username
            </label>
            <div
              className="rounded-lg px-4 py-2 text-sm"
              style={{
                backgroundColor: "var(--bg-page)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                opacity: 0.7,
              }}
            >
              @{user.username}
            </div>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Username cannot be changed after registration.
            </p>
          </div>

          {/* Error */}
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
            disabled={saving || !displayName.trim()}
            className="rounded-lg px-4 py-2.5 text-sm font-medium
                       transition-all duration-150
                       disabled:opacity-50 disabled:cursor-not-allowed
                       hover:opacity-90"
            style={{
              backgroundColor: saved ? "#2d6a4f" : "var(--text-primary)",
              color: "var(--bg-page)",
            }}
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
