import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Path, Query
from models.auth_model import AuthRequest
from models.request_model import DeleteRequest
from services.user_service import UserService
from dependencies.auth_dependencies import get_current_user
from repositories.websocket_manager import ws_manager

router = APIRouter()
def get_user_service() -> UserService:
    return UserService()
@router.post("/UserId")
async def login_signup(
    signup_request: AuthRequest, 
    user_service: UserService = Depends(get_user_service)):
    try:
        result = await user_service.get_create_user(signup_request.email, signup_request.first_name, signup_request.last_name, signup_request.partner)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/conversations")
async def get_all_conversations(
    payload: dict = Depends(get_current_user), 
    user_service: UserService = Depends(get_user_service)):
    try:    
        result = await user_service.get_conversations(uuid.UUID(payload["sid"]))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/conversations/{chat_id}")
async def get_single_conversation(
    chat_id: str = Path(...), 
    payload: dict = Depends(get_current_user), 
    user_service: UserService = Depends(get_user_service)):
    try:    
        result = await user_service.get_single_conversation(uuid.UUID(payload["sid"]), uuid.UUID(chat_id))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    
@router.patch("/conversations/{chat_id}")
async def rename_or_delete_conversation(
    chat_id: str = Path(...), 
    title: Optional[str] = Query(None), 
    delete_request: Optional[DeleteRequest] = None,
    payload: dict = Depends(get_current_user), 
    user_service: UserService = Depends(get_user_service)):
    try:    
        if title:
            result = await user_service.rename_conversation(uuid.UUID(payload["sid"]), uuid.UUID(chat_id), title)
            return result
        elif delete_request:
            result = await user_service.delete_conversation(uuid.UUID(payload["sid"]), uuid.UUID(chat_id))
            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# @router.post("/ws_check")
# async def ws_check(message: str):
#     try:
#         await ws_manager.send_to_user(
#             sid="77e40363-2a0e-467f-b9e0-7631bbba44df", 
#             message_type="EndStream", 
#             data="nice"
#         )
#     except Exception as e:
#         raise HTTPException(status_code=400, detail=str(e))