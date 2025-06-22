# models/chatHistory_model.py
import uuid
from datetime import datetime, UTC
from sqlalchemy import Boolean, Index, Integer, Text, TIMESTAMP, LargeBinary, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .base import Base
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.users_model import Users
    from models.user_document_model import UserDocument

class ChatHistory(Base):
    __tablename__ = "chat_history"

    __table_args__ = (
        Index(
            "ix_chat_history_user_visible_time",
            "user_id",
            "visible",
            "last_updated"
        ),
    )

    chat_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), index=True, nullable=False)
    visible: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    history_blob: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    chat_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_updated: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), 
                                                   default=lambda: datetime.now(UTC), server_default=text("timezone('utc', now())"), 
                                                   onupdate=lambda: datetime.now(UTC), server_onupdate=text("timezone('utc', now())"), 
                                                   nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    users: Mapped["Users"] = relationship(back_populates="chat_history")
    documents: Mapped[list["UserDocument"]] = relationship(back_populates="chat_history", cascade="all, delete-orphan")
