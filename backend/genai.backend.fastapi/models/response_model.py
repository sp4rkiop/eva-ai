from typing import Optional
import uuid
from pydantic import BaseModel


class ChatResponse(BaseModel):
    success: bool
    chat_id: Optional[uuid.UUID] = None
    error_message: Optional[str] = None


class ChatStream(BaseModel):
    chat_id: uuid.UUID
    message: str
