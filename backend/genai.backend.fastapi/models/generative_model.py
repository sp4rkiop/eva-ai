import uuid
from pydantic import BaseModel

class GenerativeModel(BaseModel):
    deployment_id: uuid.UUID
    deployment_name: str
    model_name: str
    model_type: str
    model_version: str
    provider: str
    endpoint: str
    api_key: str
    is_active: bool