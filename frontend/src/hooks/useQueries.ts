"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore } from "../store/authStore";
import { apiFetch } from "../lib/api";
import type { Conversation, User } from "../types";

// ── Response shapes ────────────────────────────────────────────────────────

interface ConversationListResponse {
  conversations: Conversation[];
}

interface UserSearchResponse {
  total: number;
  users: User[];
}

interface MessageHistoryResponse {
  has_more: boolean;
  messages: import("../types").Message[];
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useConversations() {
  const token = useAuthStore((s) => s.access_token);
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () =>
      apiFetch<ConversationListResponse>("/conversations", { token: token! }),
    enabled: !!token,
    refetchOnWindowFocus: true,
    // Refetch every 30s so unread counts stay fresh even without WS events
    refetchInterval: 30_000,
  });
}

export function useMessages(conversationId: string) {
  const token = useAuthStore((s) => s.access_token);
  return useInfiniteQuery({
    queryKey: ["messages", conversationId],
    queryFn: ({ pageParam }) =>
      apiFetch<MessageHistoryResponse>(
        `/conversations/${conversationId}/messages${pageParam ? `?before=${pageParam}` : ""}`,
        { token: token! },
      ),
    getNextPageParam: (last) =>
      last.has_more ? last.messages.at(-1)?.id : undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!token && !!conversationId,
  });
}

export function useUsers(q: string) {
  const token = useAuthStore((s) => s.access_token);
  return useQuery({
    queryKey: ["users", q],
    queryFn: () =>
      apiFetch<UserSearchResponse>(
        `/users?q=${encodeURIComponent(q)}`,
        { token: token! },
      ),
    enabled: !!token && q.length >= 2,
    staleTime: 30_000,
  });
}
