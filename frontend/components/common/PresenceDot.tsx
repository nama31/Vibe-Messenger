/**
 * PresenceDot — small circle indicating online/offline status.
 * Designed to be overlaid on an avatar (absolute positioned by the parent).
 */
export function PresenceDot({
  isOnline,
  className = "",
}: {
  isOnline: boolean;
  /** Extra classes for positioning — e.g. "absolute bottom-0 right-0" */
  className?: string;
}) {
  return (
    <span
      aria-label={isOnline ? "Online" : "Offline"}
      className={`block w-2.5 h-2.5 rounded-full ring-2 ${
        isOnline ? "bg-green-500" : "bg-[var(--text-secondary)]"
      } ring-[var(--bg-sidebar)] ${className}`}
    />
  );
}
