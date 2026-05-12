"use client";

import { useEffect, useState } from "react";

interface Props {
  message: string;
  onDismiss: () => void;
  /** Auto-dismiss after ms. Default 4000. Pass 0 to disable. */
  duration?: number;
}

export function Toast({ message, onDismiss, duration = 4000 }: Props) {
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (!duration) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50
                 flex items-center gap-3 px-4 py-2.5 rounded-lg border
                 shadow-lg text-sm transition-all duration-300"
      style={{
        backgroundColor: "rgba(127,29,29,0.12)",
        borderColor: "rgba(185,28,28,0.3)",
        color: "#f87171",
        opacity: visible ? 1 : 0,
        transform: `translateX(-50%) translateY(${visible ? "0" : "-8px"})`,
      }}
      role="alert"
      aria-live="assertive"
    >
      {/* Error icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>

      <span className="flex-1">{message}</span>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
