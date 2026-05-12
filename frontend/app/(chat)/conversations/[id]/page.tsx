"use client";

import { use } from "react";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ConversationPage({ params }: Props) {
  const { id } = use(params);
  return (
    <ErrorBoundary>
      <ChatWindow conversationId={id} />
    </ErrorBoundary>
  );
}
