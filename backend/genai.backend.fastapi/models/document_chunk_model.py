# models/document_chunk_model.py
import uuid
from typing import TYPE_CHECKING
from datetime import datetime, UTC
from sqlalchemy import ForeignKey, TIMESTAMP, Index
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import mapped_column, Mapped, relationship
from pgvector.sqlalchemy import Vector  # ← pgvector column type
from .base import Base

if TYPE_CHECKING:
    from models.user_document_model import UserDocument


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    # --- Indexes ---
    __table_args__ = (
        # Approximate Nearest Neighbour index for vector search (cosine distance)
        Index(
            "ix_document_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
            postgresql_with={
                "m": 16,
                "ef_construction": 64,
            },  # tuned for medium corpora
        ),
    )

    chunk_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("user_documents.document_id", ondelete="CASCADE"),
        nullable=False,
        index=True,  # simple B-tree for equality filter
    )
    content: Mapped[str] = mapped_column(nullable=False)
    embedding: Mapped[list[float]] = mapped_column(
        Vector(1536), nullable=False
    )  # 1536 for OpenAI
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    document: Mapped["UserDocument"] = relationship(back_populates="chunks")
