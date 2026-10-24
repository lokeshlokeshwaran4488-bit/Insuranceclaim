import uuid
from datetime import datetime, date, time, timezone
from sqlalchemy import String, DateTime, Date, Time, Numeric, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.database.postgres import Base


def utcnow():
    return datetime.now(timezone.utc)


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    claim_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    policy_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("policies.id", ondelete="RESTRICT"), nullable=False
    )
    customer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    # Incident Details
    incident_type: Mapped[str] = mapped_column(String(100), nullable=False)
    incident_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    incident_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    incident_location: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Financial
    requested_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    approved_amount: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)

    # Status & AI
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="DRAFT", index=True)
    fraud_score: Mapped[float | None] = mapped_column(Numeric(5, 4), nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(20), nullable=True)  # LOW|MODERATE|HIGH|VERY_HIGH

    # Assignment
    assigned_officer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Decision
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    approval_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    # Relationships
    policy: Mapped["Policy"] = relationship("Policy", back_populates="claims")  # noqa: F821
    customer: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="claims", foreign_keys=[customer_id]
    )
    assigned_officer: Mapped["User | None"] = relationship(  # noqa: F821
        "User", back_populates="assigned_claims", foreign_keys=[assigned_officer_id]
    )
    timeline: Mapped[list["ClaimTimeline"]] = relationship(  # noqa: F821
        "ClaimTimeline", back_populates="claim", order_by="ClaimTimeline.created_at"
    )
    reviews: Mapped[list["ClaimReview"]] = relationship(  # noqa: F821
        "ClaimReview", back_populates="claim"
    )
    document_requests: Mapped[list["DocumentRequest"]] = relationship(  # noqa: F821
        "DocumentRequest", back_populates="claim"
    )
    settlement: Mapped["Settlement | None"] = relationship(  # noqa: F821
        "Settlement", back_populates="claim", uselist=False
    )
    notifications: Mapped[list["Notification"]] = relationship(  # noqa: F821
        "Notification", back_populates="claim"
    )

    def __repr__(self) -> str:
        return f"<Claim {self.claim_number} status={self.status}>"
