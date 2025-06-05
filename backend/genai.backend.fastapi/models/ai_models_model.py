# models/aiModel_model.py
import uuid
from sqlalchemy import Boolean, Text, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .base import Base
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.subscriptions_model import Subscriptions

class AiModels(Base):
    __tablename__ = "ai_models"
    __table_args__ = (
        UniqueConstraint('deployment_name', 'model_version', name='uix_deployment_version'),
    )

    model_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False, index=True)
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    deployment_name: Mapped[str] = mapped_column(Text, nullable=False)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    model_name: Mapped[str] = mapped_column(Text, nullable=False)
    model_type: Mapped[str] = mapped_column(String(50), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)

    # Relationships
    subscriptions: Mapped[list["Subscriptions"]] = relationship(back_populates="ai_models")
