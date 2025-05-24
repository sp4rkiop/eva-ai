import uuid, datetime
from pydantic import BaseModel

class ChatHistory(BaseModel):
    chat_id: uuid.UUID
    user_id: uuid.UUID
    chat_title: str
    chat_history: bytearray
    created_at: datetime.datetime
    net_token_consumed: int
    visible: bool