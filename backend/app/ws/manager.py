import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    """Manages in-memory WebSocket rooms keyed by conversation_id."""

    def __init__(self):
        # conversation_id (str) → list of (WebSocket, user_id)
        self.rooms: dict[str, list[tuple[WebSocket, str]]] = defaultdict(list)

    async def connect(self, ws: WebSocket, conversation_id: str, user_id: str) -> None:
        """Accept the WebSocket and register it in the conversation room."""
        await ws.accept()
        self.rooms[conversation_id].append((ws, user_id))

    def disconnect(self, ws: WebSocket, conversation_id: str, user_id: str) -> None:
        """Remove the WebSocket from the conversation room."""
        self.rooms[conversation_id] = [
            (conn, uid)
            for conn, uid in self.rooms[conversation_id]
            if conn is not ws
        ]

    async def broadcast(
        self,
        conversation_id: str,
        payload: dict,
        exclude_user_id: str | None = None,
    ) -> None:
        """Broadcast a JSON payload to all sockets in the room."""
        message = json.dumps(payload)
        for conn, uid in list(self.rooms.get(conversation_id, [])):
            if exclude_user_id and uid == exclude_user_id:
                continue
            try:
                await conn.send_text(message)
            except Exception:
                pass


manager = ConnectionManager()
