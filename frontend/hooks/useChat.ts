"use client";

import { useEffect, useReducer, useRef, useCallback } from "react";
import type { Message, WsEvent } from "../types";
import { wsUrl } from "../lib/api";

type State = { messages: Message[]; typingUsers: Record<string, boolean> };
type Action =
  | { type: "SET_MESSAGES"; messages: Message[] }
  | { type: "APPEND"; message: Message }
  | { type: "EDIT"; id: string; content: string; updated_at: string }
  | { type: "DELETE"; id: string }
  | { type: "SET_TYPING"; user_id: string; is_typing: boolean };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_MESSAGES":
      return { ...state, messages: action.messages };
    case "APPEND":
      return { ...state, messages: [...state.messages, action.message] };
    case "EDIT":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, content: action.content, is_edited: true, updated_at: action.updated_at } : m,
        ),
      };
    case "DELETE":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, is_deleted: true, content: "[deleted]" } : m,
        ),
      };
    case "SET_TYPING":
      return {
        ...state,
        typingUsers: { ...state.typingUsers, [action.user_id]: action.is_typing },
      };
    default:
      return state;
  }
}

export function useChat(conversationId: string, token: string | null) {
  const [state, dispatch] = useReducer(reducer, { messages: [], typingUsers: {} });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token || !conversationId) return;
    const ws = new WebSocket(wsUrl(conversationId, token));
    wsRef.current = ws;

    ws.onopen = () => {
      // Mark read as soon as the connection is established
      ws.send(JSON.stringify({ action: "mark_read" }));
    };

    ws.onmessage = (e) => {
      const event: WsEvent = JSON.parse(e.data);
      switch (event.event) {
        case "chat_message":
          dispatch({ type: "APPEND", message: event.payload });
          break;
        case "message_edited":
          dispatch({ type: "EDIT", id: event.payload.id, content: event.payload.content, updated_at: event.payload.updated_at });
          break;
        case "message_deleted":
          dispatch({ type: "DELETE", id: event.payload.id });
          break;
        case "typing_status":
          dispatch({ type: "SET_TYPING", user_id: event.payload.user_id, is_typing: event.payload.is_typing });
          break;
      }
    };

    return () => ws.close();
  }, [conversationId, token]);

  const markRead = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "mark_read" }));
    }
  }, []);

  const sendMessage = useCallback((content: string, message_type = "text") => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "send_message", content, message_type }));
    }
  }, []);

  const sendTyping = useCallback((is_typing: boolean) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "typing", is_typing }));
    }
  }, []);

  return { messages: state.messages, typingUsers: state.typingUsers, sendMessage, sendTyping, markRead };
}
