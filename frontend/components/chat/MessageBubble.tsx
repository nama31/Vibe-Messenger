"use client";

import { useState, useCallback } from "react";
import { useAuthStore } from "../../store/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import type { Message } from "../../types";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Edit modal (inline) ────────────────────────────────────────────────────

function EditModal({
  message,
  onClose,
}: {
  message: Message;
  onClose: () => void;
}) {
  const token = useAuthStore((s) => s.access_token);
  const queryClient = useQueryClient();
  const [content, setContent] = useState(message.content);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!token || !content.trim() || content === message.content) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/messages/${message.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ content: content.trim() }),
      });
      queryClient.invalidateQueries({
        queryKey: ["messages", message.conversation_id],
      });
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-4 shadow-xl"
        style={{ backgroundColor: "var(--bg-sidebar)" }}
      >
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Edit message
        </h3>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none border resize-none
                     focus:ring-2 focus:ring-[var(--text-secondary)]/40"
          style={{
            backgroundColor: "var(--bg-page)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="px-4 py-1.5 rounded-lg text-sm font-medium
                       disabled:opacity-50 hover:opacity-90"
            style={{
              backgroundColor: "var(--text-primary)",
              color: "var(--bg-page)",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MessageBubble ──────────────────────────────────────────────────────────

interface Props {
  message: Message;
  isOwn: boolean;
  /** Hide avatar/name for consecutive messages from the same sender */
  hideAvatar?: boolean;
}

export function MessageBubble({ message, isOwn, hideAvatar = false }: Props) {
  const token = useAuthStore((s) => s.access_token);
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);

  const isDeleted = message.is_deleted;
  const isEmoji = message.message_type === "emoji" && !isDeleted;

  const handleDelete = useCallback(async () => {
    if (!token) return;
    try {
      await apiFetch(`/messages/${message.id}`, { method: "DELETE", token });
      queryClient.invalidateQueries({
        queryKey: ["messages", message.conversation_id],
      });
    } catch {
      // silently ignore
    }
  }, [token, message.id, message.conversation_id, queryClient]);

  return (
    <>
      <li
        className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Avatar — left side for others, hidden for own */}
        <div className="w-8 shrink-0">
          {!isOwn && !hideAvatar && (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center
                         text-xs font-semibold select-none"
              style={{
                backgroundColor: "var(--text-secondary)",
                color: "var(--bg-page)",
              }}
              title={message.sender.display_name}
            >
              {initials(message.sender.display_name)}
            </div>
          )}
        </div>

        {/* Bubble + meta */}
        <div
          className={`flex flex-col gap-0.5 max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}
        >
          {/* Sender name — only for others, only when avatar is shown */}
          {!isOwn && !hideAvatar && (
            <span
              className="text-xs font-medium px-1"
              style={{ color: "var(--text-secondary)" }}
            >
              {message.sender.display_name}
            </span>
          )}

          <div className={`flex items-end gap-1.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
            {/* The bubble itself */}
            {isEmoji ? (
              /* Emoji — no bubble, just large text */
              <span className="text-4xl leading-none select-none px-1">
                {message.content}
              </span>
            ) : isDeleted ? (
              /* Deleted */
              <span
                className="italic text-sm px-4 py-2 rounded-2xl"
                style={{
                  color: "var(--text-secondary)",
                  backgroundColor: isOwn ? "var(--bubble-own)" : "var(--bubble-other)",
                  opacity: 0.6,
                }}
              >
                [deleted]
              </span>
            ) : (
              /* Normal message */
              <div
                className={`px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words
                  ${isOwn ? "rounded-2xl rounded-br-sm" : "rounded-2xl rounded-bl-sm"}`}
                style={{
                  backgroundColor: isOwn
                    ? "var(--bubble-own)"
                    : "var(--bubble-other)",
                  color: isOwn ? "var(--bg-page)" : "var(--text-primary)",
                }}
              >
                {message.content}
                {message.is_edited && (
                  <span
                    className="ml-1.5 text-[10px]"
                    style={{
                      color: isOwn
                        ? "rgba(255,251,244,0.55)"
                        : "var(--text-secondary)",
                    }}
                  >
                    · edited
                  </span>
                )}
              </div>
            )}

            {/* Edit / delete actions — own messages only, on hover */}
            {isOwn && !isDeleted && hovered && (
              <div className="flex items-center gap-0.5 mb-1 shrink-0">
                {/* Edit */}
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Edit message"
                  className="w-6 h-6 flex items-center justify-center rounded-md
                             transition-colors duration-100"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.color =
                      "var(--text-primary)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.color =
                      "var(--text-secondary)")
                  }
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                {/* Delete */}
                <button
                  type="button"
                  onClick={handleDelete}
                  aria-label="Delete message"
                  className="w-6 h-6 flex items-center justify-center rounded-md
                             transition-colors duration-100"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.color = "#c0392b")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.color =
                      "var(--text-secondary)")
                  }
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Timestamp */}
          <span
            className="text-[10px] px-1"
            style={{ color: "var(--text-secondary)" }}
          >
            {formatTime(message.created_at)}
          </span>
        </div>
      </li>

      {/* Edit modal */}
      {editing && (
        <EditModal message={message} onClose={() => setEditing(false)} />
      )}
    </>
  );
}
