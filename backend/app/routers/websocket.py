"""
WebSocket router for real-time updates.
Manages per-user WebSocket connections.
"""

import json
from typing import Dict, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.core.security import decode_token
from app.core.logging_config import get_logger

router = APIRouter(tags=["WebSocket"])
logger = get_logger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections per user."""

    def __init__(self):
        # user_id -> list of active WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"WebSocket connected: user={user_id} total={self.connection_count}")

    def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        if user_id in self.active_connections:
            try:
                self.active_connections[user_id].remove(websocket)
            except ValueError:
                pass
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"WebSocket disconnected: user={user_id} total={self.connection_count}")

    @property
    def connection_count(self) -> int:
        return sum(len(conns) for conns in self.active_connections.values())

    async def send_to_user(self, user_id: str, message: dict) -> None:
        """Send a JSON message to all connections of a specific user."""
        if user_id in self.active_connections:
            dead = []
            for ws in self.active_connections[user_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.disconnect(user_id, ws)

    async def broadcast(self, message: dict) -> None:
        """Broadcast a message to all connected users."""
        for user_id in list(self.active_connections.keys()):
            await self.send_to_user(user_id, message)


# Global connection manager singleton
manager = ConnectionManager()


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time updates.
    Client must pass JWT token as query parameter: /ws/{user_id}?token=<JWT>
    """
    # Validate JWT
    payload = decode_token(token)
    if not payload or payload.get("sub") != user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await manager.connect(user_id, websocket)
    try:
        # Send connection confirmation
        await websocket.send_json({
            "type": "CONNECTED",
            "message": "Real-time connection established",
            "user_id": user_id,
        })

        # Keep connection alive
        while True:
            data = await websocket.receive_text()
            # Handle ping/pong
            if data == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)


async def notify_user(user_id: str, event_type: str, data: dict) -> None:
    """
    Utility function to push a real-time notification to a specific user.
    Called from services when claim status changes, etc.
    """
    message = {
        "type": event_type,
        **data,
    }
    await manager.send_to_user(user_id, message)
