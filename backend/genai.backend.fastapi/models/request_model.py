import uuid
from typing import Optional
from pydantic import BaseModel, EmailStr

class AuthRequest(BaseModel):
    email_id: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    partner: str

class DeleteRequest(BaseModel):
    delete: bool

class ChatRequest(BaseModel):
    model_id: uuid.UUID
    user_input: str
    chat_id: Optional[uuid.UUID] = None

