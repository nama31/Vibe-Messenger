"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUsers } from "@/hooks/useQueries";
import { useAuthStore } from "@/store/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PresenceDot } from "@/components/common/PresenceDot";
import type { Conversation, User } from "@/types";

interface ConversationResponse extends Conversation {}

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

interface Props {
  /** Called after a DM is created/found — parent can use this to close modals etc. */
  onSelectUser?: (userId: string) => void;
}

export function UserSearch({ onSelectUser }: Props) {
  const router = useRouter();
  const token = useAuthStore((s) => s.access_token);
  const queryClient = useQueryClient();

  const [inputValue, setInputValue] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null); // user id being created

  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce: update query key 300ms after the user stops typing
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(inputValue.trim()), 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  // Open dropdown when there's a query
  useEffect(() => {
    setOpen(debouncedQ.length >= 2);
  }, [debouncedQ]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data, isFetching } = useUsers(debouncedQ);
  const users = data?.users ?? [];

  const handleStartChat = useCallback(
    async (user: User) => {
      if (!token || creating) return;
      setCreating(user.id);
      try {
        const conv = await apiFetch<ConversationResponse>("/conversations", {
          method: "POST",
          token,
          body: JSON.stringify({ is_group: false, participant_ids: [user.id] }),
        });
        // Invalidate so the sidebar list refreshes
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        setInputValue("");
        setOpen(false);
        onSelectUser?.(user.id);
        router.push(`/conversations/${conv.id}`);
      } catch {
        // silently ignore — could add a toast here in Phase 7
      } finally {
        setCreating(null);
      }
    },
    [token, creating, queryClient, onSelectUser, router],
  );

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input */}
      <input
        type="search"
        placeholder="Search users…"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => debouncedQ.length >= 2 && setOpen(true)}
        className="w-full rounded-lg px-3 py-1.5 text-sm outline-none border
                   transition-colors duration-150
                   focus:ring-2 focus:ring-[var(--text-secondary)]/40"
        style={{
          backgroundColor: "var(--bg-page)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
        }}
        aria-label="Search users"
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
      />

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-xl shadow-lg
                     border overflow-hidden z-20"
          style={{
            backgroundColor: "var(--bg-sidebar)",
            borderColor: "var(--border)",
          }}
          role="listbox"
        >
          {isFetching && users.length === 0 && (
            <p
              className="px-4 py-3 text-xs text-center"
              style={{ color: "var(--text-secondary)" }}
            >
              Searching…
            </p>
          )}

          {!isFetching && users.length === 0 && (
            <p
              className="px-4 py-3 text-xs text-center"
              style={{ color: "var(--text-secondary)" }}
            >
              No users found for &ldquo;{debouncedQ}&rdquo;
            </p>
          )}

          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer
                         transition-colors duration-100"
              style={{ borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLDivElement).style.backgroundColor =
                  "rgba(0,0,0,0.04)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent")
              }
              role="option"
              aria-selected={false}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center
                             text-xs font-semibold select-none"
                  style={{
                    backgroundColor: "var(--text-secondary)",
                    color: "var(--bg-page)",
                  }}
                >
                  {initials(user.display_name)}
                </div>
                <PresenceDot
                  isOnline={user.is_online}
                  className="absolute bottom-0 right-0"
                />
              </div>

              {/* Name + username */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {user.display_name}
                </p>
                <p
                  className="text-xs truncate"
                  style={{ color: "var(--text-secondary)" }}
                >
                  @{user.username}
                </p>
              </div>

              {/* Chat button */}
              <button
                type="button"
                onClick={() => handleStartChat(user)}
                disabled={creating === user.id}
                className="shrink-0 text-xs font-medium px-3 py-1 rounded-lg
                           transition-opacity duration-150
                           disabled:opacity-50"
                style={{
                  backgroundColor: "var(--text-primary)",
                  color: "var(--bg-page)",
                }}
              >
                {creating === user.id ? "…" : "Chat"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
