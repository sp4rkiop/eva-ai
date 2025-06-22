import asyncio, os, aiofiles, uuid, tempfile, pickle, shutil
from pathlib import Path
from itertools import islice
from typing import Annotated, List, Optional, Sequence
from fastapi import HTTPException, UploadFile, status
from pydantic import BaseModel, SecretStr
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import PostgreSQLDatabase
from core.redis_cache import RedisCache
from core.config import settings
from models.ai_models_model import AiModels
from models.response_model import ChatResponse
from models.chat_history_model import ChatHistory
from models.user_document_model import UserDocument
from models.document_chunk_model import DocumentChunk
from langgraph.prebuilt import InjectedState
from langchain_openai import AzureOpenAIEmbeddings
from repositories.websocket_manager import ws_manager
from langchain_core.documents import Document
from pypdf import PdfReader 
from langchain.text_splitter import (
    RecursiveCharacterTextSplitter,
    Language,               # for code‑aware splitting
    MarkdownTextSplitter,   # optional markdown logic
)
from langchain_community.document_loaders import (
    PyPDFLoader,
    UnstructuredPDFLoader,               # .pdf with OCR
    UnstructuredWordDocumentLoader,      # .docx
    UnstructuredPowerPointLoader,        # .pptx
    UnstructuredExcelLoader,             # .xlsx
    UnstructuredEmailLoader,             # .eml / .msg
    UnstructuredHTMLLoader,              # .html / .htm
    CSVLoader,                           # .csv
    TextLoader,                          # .txt / any plain‑text
)

from services.management_service import ManagementService

MAX_BYTES = 30 * 1024 * 1024   # 30 MB

class DocumentRetrieverTool(BaseModel):
    query: str
    top_k: int
    search_pattern: str
    state: Annotated[dict, InjectedState]

class DocumentService:
    def __init__(self) -> None:
        self.embedding_model: AzureOpenAIEmbeddings

    async def get_llm_from_model(self) -> AzureOpenAIEmbeddings:
        """
        Initializes and returns an AzureOpenAIEmbeddings instance using the model's details.
        """
        available_models: List[AiModels] = await ManagementService.get_all_models()
        embed_model = next((m for m in available_models if m.model_type == "embedding" and m.is_active), None)
        if embed_model is None:
            raise Exception("Embedding model is not available atm")
        return AzureOpenAIEmbeddings(
            dimensions=1536,
            azure_endpoint=embed_model.endpoint,
            api_key=SecretStr(embed_model.api_key),
            azure_deployment=embed_model.deployment_name,
            model = embed_model.deployment_name,
            api_version=settings.AZURE_OPENAI_API_VERSION,
        )
    
    async def get_embedding_for_text(self, text: str) -> List[float]:
        """
        Generate embedding for the given text.

        Args:
            text: The input text to generate an embedding for.

        Returns:
            A list of floats representing the embedding.
        """
        text = text.replace("\n", " ")
        return await self.embedding_model.aembed_query(text)
    
    async def store_file(
        self, *, user_id: uuid.UUID, file: UploadFile, chat_id: Optional[uuid.UUID] = None
    ) -> ChatResponse:
        path = ""
        new_chat_id = None
        try:
            #-----------------------------------------------------------------
            if chat_id is None:
                async with PostgreSQLDatabase.get_session() as session:
                    new_chat = ChatHistory(
                        user_id=user_id,
                        history_blob=pickle.dumps({}),
                        chat_title="",
                        token_count=0
                    )
                    session.add(new_chat)
                    await session.flush()
                    new_chat_id = new_chat.chat_id
                    await session.commit()

            #-----------------------------------------------------------------
            path = await self._save_file_locally(file)
            self.embedding_model = await self.get_llm_from_model()
            async with PostgreSQLDatabase.get_session() as session:
                doc = UserDocument(
                    user_id=user_id, 
                    chat_id=chat_id or new_chat_id, 
                    file_name=file.filename, 
                    file_path=path
                )
                session.add(doc)
                await session.flush()  # we need doc.document_id
                await ws_manager.send_to_user(
                    sid=user_id,
                    message_type="ToolProcess",
                    data={"chat_id": str(chat_id if chat_id else user_id), "content": f"Processing {file.filename}..."}
                )
                await self._embed_and_persist_chunks(path, doc.document_id, session)
                await ws_manager.send_to_user(
                    sid=user_id,
                    message_type="ToolProcess",
                    data={"chat_id": str(chat_id if chat_id else user_id), "content": f"Finished processing {file.filename}."}
                )
                await session.commit()
            return ChatResponse(success=True, chat_id=chat_id or new_chat_id)
        except ValueError as e:
            return ChatResponse(success=False, chat_id=chat_id or new_chat_id, error_message=str(e))
        except Exception as e:
            return ChatResponse(success=False, chat_id=chat_id or new_chat_id, error_message=str(e))
        finally:
            # Finally delete the uploaded file
            if path not in ["", None] and os.path.exists(path):
                os.remove(path)
                shutil.rmtree(os.path.dirname(path))
        
    async def get_all_files_for_user(self, user_id: uuid.UUID) -> List[UserDocument]:
        async with PostgreSQLDatabase.get_session() as session:
            stmt = select(UserDocument).where(UserDocument.user_id == user_id)
            results = await session.execute(stmt)
            return list(results.scalars().unique().all())
    
    async def get_files_for_chat(self, user_id: uuid.UUID, chat_id: uuid.UUID) -> List[UserDocument]:
        async with PostgreSQLDatabase.get_session() as session:
            stmt = select(UserDocument).where(UserDocument.user_id == user_id, UserDocument.chat_id == chat_id)
            results = await session.execute(stmt)
            return list(results.scalars().unique().all())
        
    async def delete_file(self, user_id: uuid.UUID, document_id: List[uuid.UUID]):
        async with PostgreSQLDatabase.get_session() as session:
            # Fetch all documents matching the provided document IDs
            stmt = select(UserDocument).where(UserDocument.document_id.in_(document_id))
            results = await session.execute(stmt)
            documents = results.scalars().all()

            # Check if all document IDs are found
            if len(documents) != len(document_id):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="One or more files not found"
                )

            # Check if all documents belong to the provided user_id
            for document in documents:
                if document.user_id != user_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have permission to delete one or more files"
                    )

            # Delete the documents
            await session.execute(
                delete(UserDocument).where(UserDocument.document_id.in_(document_id))
            )
            await session.commit()

    async def get_relevant_docs(
            self,
            query: str,
            top_k: int = 3,
            search_pattern: str = "cosine",
            state: Optional[dict] = None
    ) -> List[Document]:
        """
        Retrieve relevant document chunks based on the user's query using either semantic or keyword search.

        Args:
            query: The term to search in the documents.
            top_k: Number of most relevant chunks to return.
            search_pattern: Search strategy to use. Options:
                - "cosine": Use semantic similarity with vector embeddings (recommended for natural language questions).
                - "simple_keyword_search": Use keyword matching (better for exact phrase lookup or technical terms like unique IDs).

        Returns:
            A list of Document objects containing the most relevant chunks.

        Recommended use:
            - Use "cosine" for general questions, paraphrased queries, or when semantic meaning is important.
            - Use "simple_keyword_search" only when the query is like to unique Identifier, do not require semantic meaning.
        """
        if not state:
            return []
        await ws_manager.send_to_user(
            sid=state["user_id"],
            message_type="ToolProcess",
            data={"chat_id": state["chat_id"], "content": "Retrieving relevant sections..."}
        )
        self.embedding_model = await self.get_llm_from_model()
        # Step 1: Generate query embedding
        query_embedding = await self.get_embedding_for_text(query)

        async with PostgreSQLDatabase.get_session() as session:
            if search_pattern == "simple_keyword_search":
                stmt = (
                    select(DocumentChunk.chunk_id, DocumentChunk.content)
                    .join(
                        UserDocument, 
                        UserDocument.document_id == DocumentChunk.document_id
                    )
                    .where(
                        UserDocument.user_id == state["user_id"],
                        UserDocument.chat_id == uuid.UUID(state["chat_id"]),
                        DocumentChunk.content.contains(query),
                    )
                    .limit(top_k)
                )
            else:    
                # Also supports max_inner_product, cosine_distance, l1_distance, hamming_distance, and jaccard_distance
                distance_expr = DocumentChunk.embedding.cosine_distance(query_embedding)
                stmt = (
                    select(
                        DocumentChunk.chunk_id,
                        DocumentChunk.content,
                        distance_expr.label("distance"),
                    )
                    .join(UserDocument, UserDocument.document_id == DocumentChunk.document_id)
                    .where(
                        UserDocument.user_id == state["user_id"],
                        UserDocument.chat_id == uuid.UUID(state["chat_id"]),
                    )
                    .order_by(distance_expr.asc()) # closest first = more relevant
                    .limit(top_k)
                )
            results = (await session.execute(stmt)).all()
        # Convert each row to a Document object
        return [
            Document(
                # id=str(row.chunk_id),
                page_content=row.content,
                # metadata={
                #     "distance": float(row.distance)
                # },
            )
            for row in results
        ]

    async def _save_file_locally(self, file: UploadFile) -> str:
        try:
            bytes_written = 0
            temp_dir = tempfile.mkdtemp()
            path = os.path.join(temp_dir, f"{uuid.uuid4()}_{file.filename}")
            async with aiofiles.open(path, "wb") as f:
                while chunk := await file.read(8 * 1024 * 1024):  # 8 MB
                    bytes_written += len(chunk)
                    if bytes_written > MAX_BYTES:
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail="File exceeds 100 MB limit.",
                        )
                    await f.write(chunk)
            if bytes_written == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Empty file upload is not allowed.",
                )
            return path
        except Exception as e:
            raise
        finally:
            await file.close()
            
    async def _load_and_split(self, file_path: str) -> list[Document]:
        """
        Detects file type, loads with the right LangChain loader,
        then returns *already‑split* `Document` chunks.
        Works for very large files by streaming the load in a thread.
        """
        loader = self._pick_loader(file_path)
        # Run blocking IO in a worker thread so FastAPI loop is not blocked
        raw_docs = await asyncio.to_thread(loader.load)

        # Choose a splitter *once* based on extension
        splitter = self._pick_splitter(file_path)
        return splitter.split_documents(raw_docs)

    async def _embed_and_persist_chunks(
        self, path: str, document_id: uuid.UUID, session: AsyncSession
    ):
        chunks = await self._load_and_split(path)

        batch_size = 64                      # keep RAM low for giant docs
        chunks_iter = iter(chunks)

        while batch := list(islice(chunks_iter, batch_size)):
            texts = [c.page_content for c in batch]
            embeddings = await self.embedding_model.aembed_documents(texts)
            new_rows = [
                DocumentChunk(
                    document_id=document_id,
                    content=text,
                    embedding=emb,
                )
                for text, emb in zip(texts, embeddings)
            ]
            session.add_all(new_rows)

    def _pick_loader(self, file_path: str):
        ext = Path(file_path).suffix.lower()

        match ext:
            case ".pdf":
                if self._is_scanned_pdf(file_path):
                    # Fallback to OCR-only mode (requires Tesseract or built-in pdfminer-OCR)
                    return UnstructuredPDFLoader(file_path, strategy="ocr_only")
                return PyPDFLoader(file_path)
            case ".docx":
                return UnstructuredWordDocumentLoader(file_path)
            case ".pptx" | ".ppt":
                return UnstructuredPowerPointLoader(file_path)
            case ".xlsx" | ".xls":
                return UnstructuredExcelLoader(file_path)
            case ".csv":
                return CSVLoader(file_path)
            case ".html" | ".htm":
                return UnstructuredHTMLLoader(file_path)
            case ".eml" | ".msg":
                return UnstructuredEmailLoader(file_path)
            # ── code & plain‑text fall‑through ─────────────────────────
            case ".py" | ".js" | ".ts" | ".java" | ".go" | ".c" | ".cpp" | ".cs" | ".rs":
                return TextLoader(file_path, autodetect_encoding=True)
            case ".md":
                return TextLoader(file_path, autodetect_encoding=True)  # markdown handled via splitter
            case _:
                # default to plain text; you can plug UnstructuredFileLoader here
                return TextLoader(file_path, autodetect_encoding=True)
    
    def _pick_splitter(self, file_path: str):
        ext = Path(file_path).suffix.lower()
        # Large tables / slides / mail → keep chunks smaller
        table_like = {".csv", ".xlsx", ".xls", ".pptx", ".ppt", ".eml", ".msg"}
        code_like  = {".py", ".js", ".ts", ".java", ".go", ".c", ".cpp", ".cs", ".rs"}

        if ext in code_like:
            # token‑like splitting that respects code structure
            return RecursiveCharacterTextSplitter.from_language(
                language=Language.PYTHON,         # good default for code
                chunk_size=400,
                chunk_overlap=40,
            )
        if ext in table_like:
            return RecursiveCharacterTextSplitter(chunk_size=300, chunk_overlap=20)
        if ext == ".md":
            return MarkdownTextSplitter(chunk_size=500, chunk_overlap=50)

        # fallback
        return RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=64)
        
    # helper
    def _is_scanned_pdf(self, file_path: str, max_pages: int = 3) -> bool:
        """
        Heuristic: if first N pages contain <50 printable chars, treat as scanned.
        """
        try:
            reader = PdfReader(file_path)
            for page in reader.pages[:max_pages]:
                if len(page.extract_text() or "") > 50:
                    return False
            return True
        except Exception:
            # On any parsing error assume scanned to be safe
            return True
    
    @staticmethod
    def _pg_conn_str() -> str:
        from core.database import DATABASE_URL
        return DATABASE_URL
