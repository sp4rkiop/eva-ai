import uuid
from typing import Optional
from pydantic import BaseModel

class DeleteRequest(BaseModel):
    delete: bool

class ChatRequest(BaseModel):
    modelId: uuid.UUID
    userInput: str
    chatId: Optional[uuid.UUID] = None

