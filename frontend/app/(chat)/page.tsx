export default function ChatIndexPage() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 select-none px-6 text-center"
      style={{ backgroundColor: "var(--bg-page)" }}
    >
      {/* Chat bubble illustration */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="52"
        height="52"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-secondary)"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ opacity: 0.5 }}
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>

      <div className="flex flex-col gap-1">
        <p
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          No conversation selected
        </p>
        <p
          className="text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          Select a conversation or start a new one
        </p>
      </div>
    </div>
  );
}
