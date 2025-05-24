from pydantic import BaseModel

class WebSocketConnection(BaseModel):
    user_id: str
    chat_id: str