# models package — import all models here so SQLAlchemy discovers them
from app.models.user import User
from app.models.policy import Policy
from app.models.claim import Claim
from app.models.claim_timeline import ClaimTimeline
from app.models.claim_review import ClaimReview
from app.models.document_request import DocumentRequest
from app.models.settlement import Settlement
from app.models.notification import Notification
from app.models.audit_log import AuditLog

__all__ = [
    "User",
    "Policy",
    "Claim",
    "ClaimTimeline",
    "ClaimReview",
    "DocumentRequest",
    "Settlement",
    "Notification",
    "AuditLog",
]
