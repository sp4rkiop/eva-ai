import uuid
from fastapi import APIRouter, Depends, HTTPException
from dependencies.auth_dependencies import get_current_user
from models.request_model import ChatRequest
from services.chat_service import ChatService

router = APIRouter()
def get_chat_service() -> ChatService:
    return ChatService()
@router.post("/ai_request")
async def ai_chat(chat_request: ChatRequest, payload: dict = Depends(get_current_user), chat_service: ChatService = Depends(get_chat_service)):
    try:
        return await chat_service.chat_shield(
            user_id=uuid.UUID(payload["user_id"]), 
            model_id=chat_request.model_id, 
            user_input=chat_request.user_input, 
            chat_id=chat_request.chat_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
