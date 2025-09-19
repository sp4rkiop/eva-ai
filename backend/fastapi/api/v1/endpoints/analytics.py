from typing import Annotated, Any, Dict, List, Optional
import uuid
from models.ai_models_model import AiModels
from models.request_model import AiModel
from services.management_service import ManagementService
from fastapi import APIRouter, Depends, HTTPException, Query
from dependencies.auth_dependencies import get_current_user

router = APIRouter()


def get_mgmt_service() -> ManagementService:
    return ManagementService()


@router.patch("/users/{user_id}")
async def patch_user(
    user_id: uuid.UUID,
    body: Dict[str, Any],
    management_service: ManagementService = Depends(get_mgmt_service),
):
    await management_service.modify_user(user_id, body)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    management_service: ManagementService = Depends(get_mgmt_service),
):
    await management_service.delete_user(user_id)


@router.get("/users", response_model=Dict[str, Any])
async def get_analytics(
    page_size: Annotated[int, Query(ge=1, le=100)],
    query: Annotated[Optional[str], Query(max_length=50)] = None,
    cursor: Annotated[Optional[str], Query()] = None,
    management_service: ManagementService = Depends(get_mgmt_service),
):
    try:
        return await management_service.get_users_details_paginated(
            page_size=page_size, search_query=query, cursor=cursor
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models", response_model=Dict[str, Any])
async def list_models(
    page_size: Annotated[int, Query(ge=1, le=100)],
    query: Annotated[Optional[str], Query(max_length=50)] = None,
    cursor: Annotated[Optional[str], Query()] = None,
    management_service: ManagementService = Depends(get_mgmt_service),
):
    try:
        return await management_service.get_models_paginated(
            page_size=page_size, search_query=query, cursor=cursor
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/models")
async def put_model(
    body: AiModel,
    management_service: ManagementService = Depends(get_mgmt_service),
):
    return await management_service.add_model(body)


@router.patch("/models/{model_id}")
async def patch_model(
    model_id: uuid.UUID,
    body: Dict[str, Any],
    management_service: ManagementService = Depends(get_mgmt_service),
):
    return await management_service.modify_model(model_id, body)


@router.delete("/models/{model_id}", status_code=204)
async def delete_model(
    model_id: uuid.UUID,
    management_service: ManagementService = Depends(get_mgmt_service),
):
    await management_service.delete_model(model_id)


@router.get("/usage", response_model=List[Dict[str, Any]])
async def list_usage(
    days: Annotated[int, Query(ge=1, le=90)] = 7,
    management_service: ManagementService = Depends(get_mgmt_service),
):
    try:
        return await management_service.get_usage_data(last_days=days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/home", response_model=Dict[str, Any])
async def get_analytics_home_data(
    management_service: ManagementService = Depends(get_mgmt_service),
):
    try:
        return await management_service.get_analytics_home_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
