"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useUsers } from "@/hooks/useQueries";
import { useAuthStore } from "@/store/authStore";
import { apiFetch } from "@/lib/api";
import { PresenceDot } from "@/components/common/PresenceDot";
import type { Conversation, User } from "@/types";

type Tab = "dm" | "group";

/** Initials from a display name — up to 2 chars */
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Shared user search list used by both tabs ─────────────────────────────

function UserSearchList({
  onSelect,
  actionLabel,
  selectedIds = [],
}: {
  onSelect: (user: User) => void;
  actionLabel: (user: User) => string;
  selectedIds?: string[];
}) {
  const [inputValue, setInputValue] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(inputValue.trim()), 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  const { data, isFetching } = useUsers(debouncedQ);
  const users = data?.users ?? [];

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        placeholder="Search by name or username…"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none border
                   transition-colors duration-150
                   focus:ring-2 focus:ring-[var(--text-secondary)]/40"
        style={{
          backgroundColor: "var(--bg-page)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
        }}
        aria-label="Search users"
      />

      {/* Results */}
      {debouncedQ.length >= 2 && (
        <div
          className="rounded-xl border overflow-hidden max-h-52 overflow-y-auto"
          style={{
            backgroundColor: "var(--bg-page)",
            borderColor: "var(--border)",
          }}
        >
          {isFetching && users.length === 0 && (
            <p className="px-4 py-3 text-xs text-center" style={{ color: "var(--text-secondary)" }}>
              Searching…
            </p>
          )}
          {!isFetching && users.length === 0 && (
            <p className="px-4 py-3 text-xs text-center" style={{ color: "var(--text-secondary)" }}>
              No users found for &ldquo;{debouncedQ}&rdquo;
            </p>
          )}
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 px-3 py-2.5"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold select-none"
                  style={{ backgroundColor: "var(--text-secondary)", color: "var(--bg-page)" }}
                >
                  {initials(user.display_name)}
                </div>
                <PresenceDot isOnline={user.is_online} className="absolute bottom-0 right-0" />
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {user.display_name}
                </p>
                <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                  @{user.username}
                </p>
              </div>

              {/* Action button */}
              <button
                type="button"
                onClick={() => onSelect(user)}
                disabled={selectedIds.includes(user.id)}
                className="shrink-0 text-xs font-medium px-3 py-1 rounded-lg
                           transition-opacity duration-150 disabled:opacity-40"
                style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-page)" }}
              >
                {actionLabel(user)}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewConversationModal({ open, onClose }: Props) {
  const router = useRouter();
  const token = useAuthStore((s) => s.access_token);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("dm");
  const [groupName, setGroupName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setTab("dm");
      setGroupName("");
      setSelectedUsers([]);
      setError(null);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ── DM: create or find existing conversation ──────────────────────────
  const handleDmSelect = useCallback(
    async (user: User) => {
      if (!token || loading) return;
      setLoading(true);
      setError(null);
      try {
        const conv = await apiFetch<Conversation>("/conversations", {
          method: "POST",
          token,
          body: JSON.stringify({ is_group: false, participant_ids: [user.id] }),
        });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        onClose();
        router.push(`/conversations/${conv.id}`);
      } catch {
        setError("Failed to start conversation. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [token, loading, queryClient, onClose, router],
  );

  // ── Group: add/remove selected users ─────────────────────────────────
  const handleAddToGroup = useCallback((user: User) => {
    setSelectedUsers((prev) =>
      prev.find((u) => u.id === user.id) ? prev : [...prev, user],
    );
  }, []);

  const handleRemoveFromGroup = useCallback((userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  }, []);

  // ── Group: create ─────────────────────────────────────────────────────
  const handleCreateGroup = useCallback(async () => {
    if (!token || loading) return;
    if (!groupName.trim()) {
      setError("Group name is required.");
      return;
    }
    if (selectedUsers.length === 0) {
      setError("Add at least one participant.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const conv = await apiFetch<Conversation>("/conversations", {
        method: "POST",
        token,
        body: JSON.stringify({
          is_group: true,
          name: groupName.trim(),
          participant_ids: selectedUsers.map((u) => u.id),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      onClose();
      router.push(`/conversations/${conv.id}`);
    } catch {
      setError("Failed to create group. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token, loading, groupName, selectedUsers, queryClient, onClose, router]);

  if (!open) return null;

  return (
    /* Overlay — click outside to close */
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-center justify-center z-50 px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="New conversation"
    >
      {/* Card */}
      <div
        className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-5 shadow-xl"
        style={{ backgroundColor: "var(--bg-sidebar)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            New conversation
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="transition-colors duration-150"
            style={{ color: "var(--text-secondary)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex rounded-lg p-1 gap-1"
          style={{ backgroundColor: "var(--bg-page)" }}
          role="tablist"
        >
          {(["dm", "group"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => { setTab(t); setError(null); }}
              className="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors duration-150"
              style={{
                backgroundColor: tab === t ? "var(--bg-sidebar)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              {t === "dm" ? "Direct Message" : "Group Chat"}
            </button>
          ))}
        </div>

        {/* ── DM tab ──────────────────────────────────────────────── */}
        {tab === "dm" && (
          <UserSearchList
            onSelect={handleDmSelect}
            actionLabel={() => loading ? "…" : "Chat"}
          />
        )}

        {/* ── Group tab ───────────────────────────────────────────── */}
        {tab === "group" && (
          <div className="flex flex-col gap-4">
            {/* Group name */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="group-name"
                className="text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Group name
              </label>
              <input
                id="group-name"
                type="text"
                placeholder="e.g. Project Team"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={80}
                className="rounded-lg px-3 py-2 text-sm outline-none border
                           transition-colors duration-150
                           focus:ring-2 focus:ring-[var(--text-secondary)]/40"
                style={{
                  backgroundColor: "var(--bg-page)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            {/* Selected participants chips */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((u) => (
                  <span
                    key={u.id}
                    className="flex items-center gap-1 rounded-full px-3 py-1 text-sm"
                    style={{
                      backgroundColor: "var(--bg-page)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {u.display_name}
                    <button
                      type="button"
                      onClick={() => handleRemoveFromGroup(u.id)}
                      aria-label={`Remove ${u.display_name}`}
                      className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* User search for group */}
            <UserSearchList
              onSelect={handleAddToGroup}
              actionLabel={(u) => selectedUsers.find((s) => s.id === u.id) ? "Added" : "Add"}
              selectedIds={selectedUsers.map((u) => u.id)}
            />

            {/* Create button */}
            <button
              type="button"
              onClick={handleCreateGroup}
              disabled={loading || !groupName.trim() || selectedUsers.length === 0}
              className="w-full rounded-lg py-2.5 text-sm font-medium
                         transition-opacity duration-150
                         disabled:opacity-50 disabled:cursor-not-allowed
                         hover:opacity-90"
              style={{
                backgroundColor: "var(--text-primary)",
                color: "var(--bg-page)",
              }}
            >
              {loading ? "Creating…" : `Create group${selectedUsers.length > 0 ? ` (${selectedUsers.length + 1})` : ""}`}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <p
            className="text-sm rounded-lg px-3 py-2 -mt-2"
            style={{ color: "#c0392b", backgroundColor: "rgba(192,57,43,0.08)" }}
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
