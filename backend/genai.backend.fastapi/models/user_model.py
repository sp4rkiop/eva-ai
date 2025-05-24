import uuid
from pydantic import BaseModel, EmailStr

class User(BaseModel):
    user_id: uuid.UUID
    role: str
    first_name: str
    last_name: str
    email: EmailStr
    partner: str