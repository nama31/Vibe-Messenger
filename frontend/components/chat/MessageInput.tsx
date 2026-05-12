"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface Props {
  onSend: (content: string) => void;
  onTyping: (is_typing: boolean) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, onTyping, disabled = false }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Ref to hold the stop-typing debounce timer
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Auto-resize textarea (1–5 rows)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 24; // px — matches text-sm leading
    const maxHeight = lineHeight * 5 + 24; // 5 rows + padding
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value]);

  const stopTyping = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTyping(false);
    }
  }, [onTyping]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter inserts newline
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed) {
          onSend(trimmed);
          setValue("");
          stopTyping();
        }
        return;
      }

      // Fire typing=true on any other keydown
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        onTyping(true);
      }

      // Reset the stop-typing debounce timer
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(stopTyping, 2500);
    },
    [value, onSend, onTyping, stopTyping],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed) {
        onSend(trimmed);
        setValue("");
        stopTyping();
      }
    },
    [value, onSend, stopTyping],
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 px-4 py-3"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message…"
        disabled={disabled}
        rows={1}
        className="flex-1 rounded-xl px-4 py-3 text-sm outline-none border
                   resize-none overflow-hidden transition-colors duration-150
                   focus:ring-2 focus:ring-[var(--text-secondary)]/40
                   disabled:opacity-50"
        style={{
          backgroundColor: "var(--bg-sidebar)",
          borderColor: "var(--border)",
          color: "var(--text-primary)",
          lineHeight: "1.5",
        }}
        aria-label="Message input"
      />

      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="shrink-0 rounded-xl px-4 py-3 transition-opacity duration-150
                   disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
        style={{
          backgroundColor: "var(--text-primary)",
          color: "var(--bg-page)",
        }}
      >
        {/* Send icon */}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </form>
  );
}
