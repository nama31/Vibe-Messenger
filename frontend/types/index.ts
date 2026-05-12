export type MessageType = "text" | "emoji";

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen?: string | null;
  created_at?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: User;
  content: string;
  message_type: MessageType;
  is_deleted: boolean;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageSummary {
  id: string;
  sender: Pick<User, "id" | "username">;
  content: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  name: string | null;
  is_group: boolean;
  participants: User[];
  last_message: MessageSummary | null;
  unread_count: number;
  created_at: string;
}

// ── WebSocket event payloads ───────────────────────────────────────────────

export type WsEvent =
  | { event: "chat_message"; payload: Message }
  | { event: "message_edited"; payload: Pick<Message, "id" | "conversation_id" | "content" | "is_edited" | "updated_at"> }
  | { event: "message_deleted"; payload: { id: string; conversation_id: string } }
  | { event: "typing_status"; payload: { conversation_id: string; user_id: string; username: string; is_typing: boolean } }
  | { event: "user_presence"; payload: { user_id: string; username: string; is_online: boolean; last_seen: string | null } }
  | { event: "participant_added"; payload: { conversation_id: string; user: User } }
  | { event: "participant_removed"; payload: { conversation_id: string; user_id: string } }
  | { event: "conversation_created"; payload: Conversation };
