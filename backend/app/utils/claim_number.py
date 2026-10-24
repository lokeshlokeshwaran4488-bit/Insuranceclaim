import random
import string
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.claim import Claim


async def generate_claim_number(db: AsyncSession) -> str:
    """
    Generate a unique claim number in format: CLM{YEAR}{SEQUENCE:04d}
    Example: CLM20260001, CLM20260002, ...
    """
    year = datetime.now().year
    prefix = f"CLM{year}"

    # Count existing claims for this year to determine sequence
    result = await db.execute(
        select(func.count(Claim.id)).where(Claim.claim_number.like(f"{prefix}%"))
    )
    count = result.scalar() or 0
    sequence = count + 1

    claim_number = f"{prefix}{sequence:04d}"

    # Verify uniqueness (handle race conditions)
    existing = await db.execute(
        select(Claim.id).where(Claim.claim_number == claim_number)
    )
    if existing.scalar_one_or_none():
        # Fallback with random suffix
        suffix = "".join(random.choices(string.digits, k=4))
        claim_number = f"{prefix}{suffix}"

    return claim_number
