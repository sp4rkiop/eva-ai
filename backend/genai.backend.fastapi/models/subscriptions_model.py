# models/userSubscription_model.py
import uuid
from sqlalchemy import ForeignKey, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .base import Base
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.users_model import Users
    from models.ai_models_model import AiModels


class Subscriptions(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (UniqueConstraint("user_id", "model_id", name="uix_user_model"),)

    sub_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("ai_models.model_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Relationships
    users: Mapped["Users"] = relationship(back_populates="subscriptions")
    ai_models: Mapped["AiModels"] = relationship(back_populates="subscriptions")
