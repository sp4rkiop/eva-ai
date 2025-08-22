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
    branch: Optional[str] = None
    temperature: Optional[float] = None
    chat_id: Optional[uuid.UUID] = None


class EditMessageRequest(BaseModel):
    model_id: uuid.UUID
    parent_branch: str
    edit_index: int
    new_message: str
    temperature: Optional[float] = None
    chat_id: Optional[uuid.UUID] = None


class AiModel(BaseModel):
    model_name: str
    model_type: str
    provider: str
    api_key: str
    endpoint: str
    deployment_name: str
    model_version: str
    is_active: bool
