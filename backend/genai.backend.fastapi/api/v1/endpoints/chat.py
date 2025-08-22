import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException
from dependencies.auth_dependencies import get_current_user
from models.request_model import ChatRequest, EditMessageRequest
from services.chat_service import ChatService

router = APIRouter()


def get_chat_service() -> ChatService:
    return ChatService()


@router.post("/ai_request")
async def ai_chat(
    chat_request: ChatRequest,
    payload: dict = Depends(get_current_user),
    chat_service: ChatService = Depends(get_chat_service),
):
    try:
        return await chat_service.chat_shield(
            user_id=uuid.UUID(payload["user_id"]),
            model_id=chat_request.model_id,
            user_input=chat_request.user_input,
            branch=chat_request.branch or "main",
            temperature=chat_request.temperature or 0.5,
            chat_id=chat_request.chat_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/edit_message")
async def edit_message(
    edit_request: EditMessageRequest,
    payload: dict = Depends(get_current_user),
    chat_service: ChatService = Depends(get_chat_service),
):
    try:
        # Generate a random 11-12 character hex string for the new branch
        new_branch = secrets.token_hex(6)  # 6 bytes = 12 hex characters

        return await chat_service.chat_shield(
            user_id=uuid.UUID(payload["user_id"]),
            model_id=edit_request.model_id,
            user_input=edit_request.new_message,
            branch=new_branch,
            temperature=edit_request.temperature or 0.5,
            chat_id=edit_request.chat_id,
            parent_branch=edit_request.parent_branch,
            edit_index=edit_request.edit_index,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
