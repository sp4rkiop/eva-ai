# models/user_model.py
import uuid
from sqlalchemy import String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .base import Base
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.chat_history_model import ChatHistory
    from models.subscriptions_model import Subscriptions
    from models.user_document_model import UserDocument

class Users(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint('email', 'partner', name='uix_email_partner'),)

    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    partner: Mapped[str] = mapped_column(String(100), nullable=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="user", server_default="user", index=True)

    # Relationships
    chat_history: Mapped[list["ChatHistory"]] = relationship(
        back_populates="users", cascade="all, delete-orphan"
    )
    subscriptions: Mapped[list["Subscriptions"]] = relationship(
        back_populates="users", cascade="all, delete-orphan"
    )
    documents: Mapped[list["UserDocument"]] = relationship(
        back_populates="users", cascade="all, delete-orphan"
    )
