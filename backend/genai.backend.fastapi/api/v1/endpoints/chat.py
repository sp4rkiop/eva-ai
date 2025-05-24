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
        res = await chat_service.chat_shield(userId=uuid.UUID(payload["sid"]), modelId=chat_request.modelId, userInput=chat_request.userInput, chatId=chat_request.chatId)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
