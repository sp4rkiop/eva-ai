from typing import Optional
from pydantic import BaseModel

class ChatResponse(BaseModel):
    success: bool
    chat_id: Optional[str] = None
    error_message: Optional[str] = None

class ChatStream(BaseModel):
    chat_id: str
    message: str