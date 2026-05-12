import type { Conversation } from "@/types";
import { PresenceDot } from "@/components/common/PresenceDot";

interface Props {
  conversation: Conversation;
  isActive: boolean;
  currentUserId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** For DMs, return the other participant. For groups, return null (use conv.name). */
function getOtherParticipant(conv: Conversation, currentUserId: string) {
  if (conv.is_group) return null;
  return conv.participants.find((p) => p.id !== currentUserId) ?? null;
}

/** Initials from a display name — up to 2 chars. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Format a timestamp as HH:mm or a short date if older than today. */
function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Component ──────────────────────────────────────────────────────────────

export function ConversationItem({ conversation, isActive, currentUserId }: Props) {
  const other = getOtherParticipant(conversation, currentUserId);

  // Display name: other participant for DMs, conversation.name for groups
  const displayName = other?.display_name ?? conversation.name ?? "Group";

  // Online status: for DMs use the other participant; for groups always false
  const isOnline = other?.is_online ?? false;

  const lastMsg = conversation.last_message;
  const unread = conversation.unread_count;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors duration-100 rounded-lg mx-1"
      style={{
        backgroundColor: isActive ? "var(--bg-page)" : "transparent",
      }}
      // Hover handled via inline style fallback — Tailwind opacity trick
      onMouseEnter={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLDivElement).style.backgroundColor =
            "rgba(var(--bg-page-rgb, 255,251,244), 0.5)";
      }}
      onMouseLeave={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
      }}
    >
      {/* ── Avatar ──────────────────────────────────────────────────── */}
      <div className="relative shrink-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center
                     text-sm font-semibold select-none"
          style={{
            backgroundColor: "var(--text-secondary)",
            color: "var(--bg-page)",
          }}
        >
          {initials(displayName)}
        </div>
        {/* Presence dot — only shown for DMs */}
        {!conversation.is_group && (
          <PresenceDot
            isOnline={isOnline}
            className="absolute bottom-0 right-0"
          />
        )}
      </div>

      {/* ── Text content ────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          {/* Name */}
          <span
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {displayName}
          </span>

          {/* Timestamp */}
          {lastMsg && (
            <span
              className="text-xs shrink-0"
              style={{ color: "var(--text-secondary)" }}
            >
              {formatTime(lastMsg.created_at)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-1 mt-0.5">
          {/* Last message snippet */}
          <p
            className="text-xs truncate flex-1"
            style={{ color: "var(--text-secondary)" }}
          >
            {lastMsg
              ? lastMsg.content === "[deleted]"
                ? "Message deleted"
                : lastMsg.content
              : "No messages yet"}
          </p>

          {/* Unread badge */}
          {unread > 0 && (
            <span
              className="shrink-0 min-w-[18px] h-[18px] flex items-center justify-center
                         rounded-full text-[10px] font-semibold px-1"
              style={{
                backgroundColor: "var(--text-primary)",
                color: "var(--bg-page)",
              }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
