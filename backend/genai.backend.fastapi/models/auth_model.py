from typing import Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime
class AuthRequest(BaseModel):
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    partner: str

