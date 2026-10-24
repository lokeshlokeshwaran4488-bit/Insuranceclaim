from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.notification import Notification
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Notification types
class NotificationType:
    CLAIM_SUBMITTED = "CLAIM_SUBMITTED"
    CLAIM_ASSIGNED = "CLAIM_ASSIGNED"
    DOCUMENT_REQUESTED = "DOCUMENT_REQUESTED"
    DOCUMENT_VERIFIED = "DOCUMENT_VERIFIED"
    DOCUMENT_REJECTED = "DOCUMENT_REJECTED"
    CLAIM_APPROVED = "CLAIM_APPROVED"
    CLAIM_REJECTED = "CLAIM_REJECTED"
    SETTLEMENT_STARTED = "SETTLEMENT_STARTED"
    SETTLEMENT_COMPLETED = "SETTLEMENT_COMPLETED"
    FRAUD_ALERT = "FRAUD_ALERT"
    ADDITIONAL_DOCS_REQUIRED = "ADDITIONAL_DOCS_REQUIRED"


async def create_notification(
    db: AsyncSession,
    user_id: str,
    notification_type: str,
    title: str,
    message: str,
    claim_id: Optional[str] = None,
) -> Notification:
    """Create a notification for a user."""
    notification = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        claim_id=claim_id,
    )
    db.add(notification)
    await db.flush()
    logger.info(f"Notification created: {notification_type} for user={user_id}")
    return notification


async def notify_claim_submitted(db: AsyncSession, claim, customer_id: str) -> None:
    await create_notification(
        db=db,
        user_id=customer_id,
        notification_type=NotificationType.CLAIM_SUBMITTED,
        title="Claim Submitted Successfully",
        message=f"Your claim {claim.claim_number} has been submitted and is under review.",
        claim_id=claim.id,
    )


async def notify_claim_approved(db: AsyncSession, claim, customer_id: str) -> None:
    await create_notification(
        db=db,
        user_id=customer_id,
        notification_type=NotificationType.CLAIM_APPROVED,
        title="Claim Approved",
        message=f"Your claim {claim.claim_number} has been approved for ₹{claim.approved_amount:,.2f}.",
        claim_id=claim.id,
    )


async def notify_claim_rejected(db: AsyncSession, claim, customer_id: str) -> None:
    await create_notification(
        db=db,
        user_id=customer_id,
        notification_type=NotificationType.CLAIM_REJECTED,
        title="Claim Rejected",
        message=f"Your claim {claim.claim_number} has been rejected. Reason: {claim.rejection_reason}",
        claim_id=claim.id,
    )


async def notify_document_requested(
    db: AsyncSession, claim, customer_id: str, message: str
) -> None:
    await create_notification(
        db=db,
        user_id=customer_id,
        notification_type=NotificationType.DOCUMENT_REQUESTED,
        title="Additional Documents Required",
        message=f"Additional documents are required for claim {claim.claim_number}: {message}",
        claim_id=claim.id,
    )


async def notify_settlement_completed(db: AsyncSession, claim, customer_id: str) -> None:
    await create_notification(
        db=db,
        user_id=customer_id,
        notification_type=NotificationType.SETTLEMENT_COMPLETED,
        title="Settlement Completed",
        message=f"Payment for your claim {claim.claim_number} has been processed successfully.",
        claim_id=claim.id,
    )
