import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database.postgres import Base


def utcnow():
    return datetime.now(timezone.utc)


class Settlement(Base):
    __tablename__ = "settlements"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    claim_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("claims.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        index=True,
    )
    approved_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    payment_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)  # after deductible
    payment_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # BANK_TRANSFER | CHEQUE | NEFT | RTGS
    payment_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="PENDING"
    )  # PENDING | PROCESSING | COMPLETED | FAILED
    bank_account_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)  # AES-256 encrypted
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Relationships
    claim: Mapped["Claim"] = relationship("Claim", back_populates="settlement")  # noqa: F821
    processor: Mapped["User | None"] = relationship("User", foreign_keys=[processed_by])  # noqa: F821
