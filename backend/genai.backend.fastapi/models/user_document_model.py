# models/user_document_model.py
import uuid
from datetime import datetime, UTC
from sqlalchemy import ForeignKey, Index, String, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING
from .base import Base

if TYPE_CHECKING:
    from models.users_model import Users
    from models.chat_history_model import ChatHistory
    from models.document_chunk_model import DocumentChunk

class UserDocument(Base):
    __tablename__ = "user_documents"
    __table_args__ = (
        Index("ix_user_documents_user_chat", "user_id", "chat_id"),
    )

    document_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    chat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_history.chat_id", ondelete="CASCADE"), nullable=False)

    file_name: Mapped[str] = mapped_column(String, nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), default=lambda: datetime.now(UTC), nullable=False)

    # Relationships
    users: Mapped["Users"] = relationship(back_populates="documents")
    chat_history: Mapped["ChatHistory"] = relationship(back_populates="documents")
    chunks: Mapped[list["DocumentChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")
