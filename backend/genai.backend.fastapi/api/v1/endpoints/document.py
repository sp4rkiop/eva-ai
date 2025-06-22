from typing import List, Optional
import uuid
from fastapi import APIRouter, Query, UploadFile, Depends, HTTPException, status
from dependencies.auth_dependencies import get_current_user
from services.document_service import DocumentService

router = APIRouter()
document_service = DocumentService()

@router.post("/upload")
async def upload_document(
    file: UploadFile,
    chat_id: Optional[uuid.UUID] = Query(None),
    payload: dict = Depends(get_current_user)
):
    try:
        return await document_service.store_file(user_id=uuid.UUID(payload["user_id"]), chat_id=chat_id, file=file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")
    
@router.get("/files")
async def get_all_files(
    payload: dict = Depends(get_current_user)
):
    try:
        return await document_service.get_all_files_for_user(uuid.UUID(payload["user_id"]))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get files: {str(e)}")

@router.get("/files_in_chat")
async def get_files_in_chat(
    chat_id: uuid.UUID,
    payload: dict = Depends(get_current_user)
):
    try:
        return await document_service.get_files_for_chat(uuid.UUID(payload["user_id"]), chat_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get files in chat: {str(e)}")
    
@router.delete("/delete_file")
async def delete_file(
    doc_id: List[uuid.UUID],
    payload: dict = Depends(get_current_user)
):
    await document_service.delete_file(uuid.UUID(payload["user_id"]), doc_id)

@router.get("/check")
async def check(
    query: str,
    search_pattern: str,
    payload: dict = Depends(get_current_user)
):
    return await document_service.get_relevant_docs(query=query, top_k=5, search_pattern=search_pattern, state={"user_id": uuid.UUID(payload["user_id"]), "chat_id": "6057f025-101f-47fc-9317-a710c9f6d8e5"})