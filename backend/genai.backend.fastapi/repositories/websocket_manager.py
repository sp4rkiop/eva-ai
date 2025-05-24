from fastapi import WebSocket
from typing import Any, Dict, Set
import logging

# Setup logging
logger = logging.getLogger(__name__)

class WebSocketManager:
    def __init__(self):
        self.users: Dict[str, Set[WebSocket]] = {}
        self.connections: Dict[str, str] = {}  # Map connection_id to sid

    async def connect(self, websocket: WebSocket, sid: str):
        await websocket.accept()
        if sid not in self.users:
            self.users[sid] = set()
        self.users[sid].add(websocket)
        # Store connection mapping
        connection_id = str(id(websocket))
        self.connections[connection_id] = sid
        logger.info(f"User {sid} has connected to chat and added to group")

    async def disconnect(self, websocket: WebSocket) -> None:
        connection_id = str(id(websocket))
        sid = self.connections.get(connection_id)
        
        if sid:
            # Remove from user group
            self.users.get(sid, set()).discard(websocket)
            if sid in self.users and not self.users[sid]:
                del self.users[sid]
                
            # Remove connection mapping
            del self.connections[connection_id]
            # await websocket.close()
            logger.info(f"User {sid} has disconnected and removed from group")
        else:
            logger.warning(f"Connection {connection_id} disconnected without a valid SID")

    async def send_to_user(self, sid: str, message_type: str, data: Any):
        for conn in self.users.get(sid, set()):
            try:
                await conn.send_json({"type": message_type, "data": data})
            except Exception as e:
                logger.error(f"Error sending message to user {sid}: {e}")

# Create a singleton instance
ws_manager = WebSocketManager()