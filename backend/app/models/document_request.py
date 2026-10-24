import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, Boolean, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database.postgres import Base


def utcnow():
    return datetime.now(timezone.utc)


class DocumentRequest(Base):
    __tablename__ = "document_requests"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    claim_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, index=True
    )
    requested_by: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    document_types: Mapped[list] = mapped_column(ARRAY(String), nullable=False, default=list)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_fulfilled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    claim: Mapped["Claim"] = relationship("Claim", back_populates="document_requests")  # noqa: F821
    requester: Mapped["User"] = relationship("User", foreign_keys=[requested_by])  # noqa: F821
