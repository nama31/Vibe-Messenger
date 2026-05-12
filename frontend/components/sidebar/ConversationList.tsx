"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConversations } from "../../hooks/useQueries";
import { useAuthStore } from "../../store/authStore";
import { ConversationItem } from "./ConversationItem";

// ── Skeleton row ───────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 mx-1">
      {/* Avatar skeleton */}
      <div
        className="w-10 h-10 rounded-full shrink-0 animate-pulse"
        style={{ backgroundColor: "var(--border)" }}
      />
      {/* Text skeleton */}
      <div className="flex-1 flex flex-col gap-2">
        <div
          className="h-3 rounded animate-pulse w-2/3"
          style={{ backgroundColor: "var(--border)" }}
        />
        <div
          className="h-2.5 rounded animate-pulse w-1/2"
          style={{ backgroundColor: "var(--border)" }}
        />
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function ConversationList() {
  const pathname = usePathname();
  const currentUserId = useAuthStore((s) => s.user?.id ?? "");
  const { data, isLoading, isError } = useConversations();

  if (isLoading) {
    return (
      <nav className="flex flex-col py-1" aria-label="Conversations loading">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </nav>
    );
  }

  if (isError) {
    return (
      <nav className="flex flex-col py-1">
        <p
          className="px-4 py-8 text-center text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          Failed to load conversations.
        </p>
      </nav>
    );
  }

  const conversations = data?.conversations ?? [];

  if (conversations.length === 0) {
    return (
      <nav className="flex flex-col py-1">
        <p
          className="px-4 py-8 text-center text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          No conversations yet.
          <br />
          <span className="text-xs">Search for a user to start chatting.</span>
        </p>
      </nav>
    );
  }

  return (
    <nav className="flex flex-col py-1" aria-label="Conversations">
      {conversations.map((conv) => {
        const isActive = pathname === `/conversations/${conv.id}`;
        return (
          <Link
            key={conv.id}
            href={`/conversations/${conv.id}`}
            // Remove default link styling — ConversationItem handles visuals
            className="block outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-secondary)] rounded-lg mx-0"
            aria-current={isActive ? "page" : undefined}
          >
            <ConversationItem
              conversation={conv}
              isActive={isActive}
              currentUserId={currentUserId}
            />
          </Link>
        );
      })}
    </nav>
  );
}
