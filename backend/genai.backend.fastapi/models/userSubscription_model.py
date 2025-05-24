import uuid
from pydantic import BaseModel

class UserSubscription(BaseModel):
    user_id: uuid.UUID
    model_id: uuid.UUID