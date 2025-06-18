import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Path, Query, Response
from fastapi.responses import JSONResponse
from models.request_model import DeleteRequest, AuthRequest
from services.user_service import UserService
from dependencies.auth_dependencies import get_current_user
from core.config import settings

router = APIRouter()
def get_user_service() -> UserService:
    return UserService()
@router.post("/authenticate")
async def login_signup(
    signup_request: AuthRequest, 
    user_service: UserService = Depends(get_user_service)):
    try:
        result = await user_service.get_create_user(
            signup_request.email_id, 
            signup_request.first_name, 
            signup_request.last_name, 
            signup_request.partner
        )

        response = Response(content=str(result["user_id"]), media_type="text/plain")
        response.headers["X-Auth-Token"] = f"{result["token"]}"
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# @router.get("/me")
# async def who_am_i(payload: dict = Depends(get_current_user)):
#     return payload

@router.get("/models")
async def get_all_models(
    payload: dict = Depends(get_current_user), 
    user_service: UserService = Depends(get_user_service)):
    try:    
        result = await user_service.get_subscribed_models(uuid.UUID(payload["user_id"]))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/conversations")
async def get_all_conversations(
    payload: dict = Depends(get_current_user), 
    user_service: UserService = Depends(get_user_service)):
    try:    
        result = await user_service.get_conversations(uuid.UUID(payload["user_id"]))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/conversations/{chat_id}")
async def get_single_conversation(
    chat_id: str = Path(...), 
    payload: dict = Depends(get_current_user), 
    user_service: UserService = Depends(get_user_service)):
    try:    
        result = await user_service.get_single_conversation(uuid.UUID(payload["user_id"]), uuid.UUID(chat_id))
        return result
    except HTTPException as http_exc:
        raise http_exc
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
            result = await user_service.rename_conversation(uuid.UUID(payload["user_id"]), uuid.UUID(chat_id), title)
            if result:
                return Response(status_code=204)
        elif delete_request:
            result = await user_service.delete_conversation(uuid.UUID(payload["user_id"]), uuid.UUID(chat_id))
            if result:
                return Response(status_code=204)
        return Response(status_code=409)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))