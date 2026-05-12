"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuthStore } from "../../store/authStore";
import { useMessages } from "../../hooks/useQueries";
import { useChat } from "../../hooks/useChat";
import { apiFetch } from "../../lib/api";
import { PresenceDot } from "../common/PresenceDot";
import { Toast } from "../common/Toast";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";
import type { Conversation } from "../../types";

interface Props {
  conversationId: string;
}

// ── Header ─────────────────────────────────────────────────────────────────

function ChatHeader({ conversation, currentUserId }: { conversation: Conversation; currentUserId: string }) {
  const other = !conversation.is_group
    ? conversation.participants.find((p) => p.id !== currentUserId)
    : null;

  const title = other?.display_name ?? conversation.name ?? "Group";
  const subtitle = conversation.is_group
    ? `${conversation.participants.length} members`
    : other?.is_online
    ? "Online"
    : other?.last_seen
    ? `Last seen ${new Date(other.last_seen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Offline";

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 shrink-0"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center
                     text-sm font-semibold select-none"
          style={{ backgroundColor: "var(--text-secondary)", color: "var(--bg-page)" }}
        >
          {title.charAt(0).toUpperCase()}
        </div>
        {!conversation.is_group && other && (
          <PresenceDot isOnline={other.is_online} className="absolute bottom-0 right-0" />
        )}
      </div>

      {/* Title + subtitle */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {title}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
          {subtitle}
        </p>
      </div>

      {/* Group: presence dots for online members */}
      {conversation.is_group && (
        <div className="flex items-center gap-1 shrink-0">
          {conversation.participants
            .filter((p) => p.is_online && p.id !== currentUserId)
            .slice(0, 5)
            .map((p) => (
              <div
                key={p.id}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold"
                style={{ backgroundColor: "var(--text-secondary)", color: "var(--bg-page)" }}
                title={p.display_name}
              >
                {p.display_name.charAt(0).toUpperCase()}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex-1 flex flex-col gap-3 px-4 py-4">
      {[70, 45, 85, 55, 65].map((w, i) => (
        <div
          key={i}
          className={`h-8 rounded-2xl animate-pulse ${i % 2 === 0 ? "self-end" : "self-start"}`}
          style={{ width: `${w}%`, backgroundColor: "var(--border)" }}
        />
      ))}
    </div>
  );
}

// ── ChatWindow ─────────────────────────────────────────────────────────────

export function ChatWindow({ conversationId }: Props) {
  const token = useAuthStore((s) => s.access_token);
  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id ?? "";

  // REST: initial history + pagination
  const {
    data: historyData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(conversationId);

  // WebSocket: real-time messages + typing
  const { messages: wsMessages, typingUsers, sendMessage, sendTyping, markRead } =
    useChat(conversationId, token);

  // Flatten all REST pages into a single array (oldest first)
  const restMessages = useMemo(() => {
    if (!historyData) return [];
    // Pages come back newest-first; reverse each page, then reverse pages
    return [...historyData.pages]
      .reverse()
      .flatMap((page) => [...page.messages].reverse());
  }, [historyData]);

  // Merge REST history with live WS messages.
  // WS messages that already exist in REST (by id) are deduplicated.
  const restIds = useMemo(() => new Set(restMessages.map((m) => m.id)), [restMessages]);
  const mergedMessages = useMemo(
    () => [
      ...restMessages,
      ...wsMessages.filter((m) => !restIds.has(m.id)),
    ],
    [restMessages, wsMessages, restIds],
  );

  // Mark read when new messages arrive (WS handles initial mark on connect)
  useEffect(() => {
    if (mergedMessages.length > 0) markRead();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedMessages.length]);

  // Fetch conversation details for the header
  const [convData, setConvData] = useState<Conversation | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const dismissToast = useCallback(() => setToastMsg(null), []);

  useEffect(() => {
    if (!token || !conversationId) return;
    apiFetch<Conversation>(`/conversations/${conversationId}`, { token })
      .then(setConvData)
      .catch(() => setToastMsg("Failed to load conversation details. Check your connection."));
  }, [conversationId, token]);

  const participants = convData?.participants ?? [];

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--bg-page)" }}>
      {/* Network error toast */}
      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
      {/* Header */}
      {convData ? (
        <ChatHeader conversation={convData} currentUserId={currentUserId} />
      ) : (
        <div
          className="h-[57px] shrink-0 animate-pulse"
          style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--border)" }}
        />
      )}

      {/* Message list */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <MessageList
          messages={mergedMessages}
          currentUserId={currentUserId}
          participants={participants}
          hasMore={!!hasNextPage}
          onLoadMore={fetchNextPage}
          loadingMore={isFetchingNextPage}
        />
      )}

      {/* Typing indicator */}
      <TypingIndicator typingUsers={typingUsers} participants={participants} />

      {/* Message input */}
      <MessageInput
        onSend={(content) => sendMessage(content)}
        onTyping={sendTyping}
        disabled={!token}
      />
    </div>
  );
}
