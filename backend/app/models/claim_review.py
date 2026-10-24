import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database.postgres import Base


def utcnow():
    return datetime.now(timezone.utc)


class ClaimReview(Base):
    __tablename__ = "claim_reviews"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    claim_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, index=True
    )
    officer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    review_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # DOCUMENT_REQUEST | RECOMMENDATION | ESCALATION | NOTE
    remarks: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str | None] = mapped_column(String(20), nullable=True)  # APPROVE | REJECT | ESCALATE
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Relationships
    claim: Mapped["Claim"] = relationship("Claim", back_populates="reviews")  # noqa: F821
    officer: Mapped["User"] = relationship("User", foreign_keys=[officer_id])  # noqa: F821
