import type { User } from "../../types";

interface Props {
  typingUsers: Record<string, boolean>;
  participants: User[];
}

export function TypingIndicator({ typingUsers, participants }: Props) {
  // Collect display names of users currently typing
  const names = participants
    .filter((p) => typingUsers[p.id] === true)
    .map((p) => p.display_name);

  if (names.length === 0) return null;

  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing`
      : `${names[0]} and ${names.length - 1} others are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5">
      {/* Bubble */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 rounded-2xl rounded-bl-sm text-sm"
        style={{
          backgroundColor: "var(--bubble-other)",
          color: "var(--text-secondary)",
        }}
      >
        {/* Three bouncing dots with staggered delay */}
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{
            backgroundColor: "var(--text-secondary)",
            animationDelay: "0ms",
            animationDuration: "900ms",
          }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{
            backgroundColor: "var(--text-secondary)",
            animationDelay: "150ms",
            animationDuration: "900ms",
          }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{
            backgroundColor: "var(--text-secondary)",
            animationDelay: "300ms",
            animationDuration: "900ms",
          }}
        />
      </div>
      <span
        className="text-xs"
        style={{ color: "var(--text-secondary)" }}
        aria-live="polite"
        aria-label={label}
      >
        {label}…
      </span>
    </div>
  );
}
