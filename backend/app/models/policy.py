import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Numeric, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database.postgres import Base


def utcnow():
    return datetime.now(timezone.utc)


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    policy_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    customer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    policy_type: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # Motor | Health | Property | Life | Travel
    coverage_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    premium_amount: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False)
    deductible_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ACTIVE"
    )  # ACTIVE | EXPIRED | CANCELLED
    policy_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    # Relationships
    customer: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="policies", foreign_keys=[customer_id]
    )
    claims: Mapped[list["Claim"]] = relationship(  # noqa: F821
        "Claim", back_populates="policy"
    )

    def __repr__(self) -> str:
        return f"<Policy {self.policy_number} type={self.policy_type} status={self.status}>"
