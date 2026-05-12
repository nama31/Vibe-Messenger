"use client";

import { useEffect, useRef } from "react";
import type { Message, User } from "../../types";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: Message[];
  currentUserId: string;
  participants: User[];
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore?: boolean;
}

/** Two messages are "grouped" if same sender and within 2 minutes of each other */
function isSameGroup(a: Message, b: Message): boolean {
  if (a.sender.id !== b.sender.id) return false;
  const diff =
    Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return diff < 2 * 60 * 1000;
}

export function MessageList({
  messages,
  currentUserId,
  participants: _participants,
  hasMore,
  onLoadMore,
  loadingMore = false,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(messages.length);

  // Auto-scroll to bottom when new messages are appended
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  // Scroll to bottom on first load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 select-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"
          fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          No messages yet. Say hello!
        </p>
      </div>
    );
  }

  return (
    /*
     * flex-col-reverse: the list grows upward from the bottom.
     * This means the newest message is always visible without JS scrolling,
     * and scrolling up reveals older messages naturally.
     */
    <div className="flex-1 overflow-y-auto flex flex-col-reverse px-4 py-3 gap-1">
      {/* Bottom anchor for auto-scroll */}
      <div ref={bottomRef} />

      {/* Messages — rendered in reverse order because of flex-col-reverse */}
      {[...messages].reverse().map((msg, reversedIdx) => {
        const originalIdx = messages.length - 1 - reversedIdx;
        const prevMsg = originalIdx > 0 ? messages[originalIdx - 1] : null;
        const hideAvatar = prevMsg ? isSameGroup(prevMsg, msg) : false;

        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.sender.id === currentUserId}
            hideAvatar={hideAvatar}
          />
        );
      })}

      {/* Load more button — at the top (bottom of reversed list) */}
      {hasMore && (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-xs px-4 py-1.5 rounded-full border transition-opacity
                       disabled:opacity-50"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-secondary)",
              backgroundColor: "var(--bg-sidebar)",
            }}
          >
            {loadingMore ? "Loading…" : "Load older messages"}
          </button>
        </div>
      )}
    </div>
  );
}
