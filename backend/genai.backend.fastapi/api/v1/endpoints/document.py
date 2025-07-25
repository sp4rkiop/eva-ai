from typing import List, Optional
import uuid
from fastapi import APIRouter, Query, UploadFile, Depends, HTTPException, status
from dependencies.auth_dependencies import get_current_user
from services.document_service import DocumentService

router = APIRouter()


def get_doc_service() -> DocumentService:
    return DocumentService()


@router.post("/upload")
async def upload_document(
    file: UploadFile,
    chat_id: Optional[uuid.UUID] = Query(None),
    payload: dict = Depends(get_current_user),
    document_service: DocumentService = Depends(get_doc_service),
):
    try:
        return await document_service.store_file(
            user_id=uuid.UUID(payload["user_id"]), chat_id=chat_id, file=file
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")


@router.get("/files")
async def get_all_files(
    payload: dict = Depends(get_current_user),
    document_service: DocumentService = Depends(get_doc_service),
):
    try:
        return await document_service.get_all_files_for_user(
            uuid.UUID(payload["user_id"])
        )
    except Exception as e:
        raise


@router.get("/files_in_chat")
async def get_files_in_chat(
    chat_id: uuid.UUID,
    payload: dict = Depends(get_current_user),
    document_service: DocumentService = Depends(get_doc_service),
):
    try:
        return await document_service.get_files_for_chat(
            uuid.UUID(payload["user_id"]), chat_id
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to get files in chat: {str(e)}"
        )


@router.delete("/delete_file")
async def delete_file(
    doc_id: List[uuid.UUID],
    payload: dict = Depends(get_current_user),
    document_service: DocumentService = Depends(get_doc_service),
):
    await document_service.delete_file(uuid.UUID(payload["user_id"]), doc_id)
