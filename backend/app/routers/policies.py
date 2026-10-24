from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.dependencies import get_current_user, get_admin
from app.database.postgres import get_db
from app.models.policy import Policy
from app.models.user import User
from app.schemas.policy import PolicyCreate, PolicyUpdate, PolicyOut, PolicyListResponse
from app.services.audit_service import create_audit_log

router = APIRouter(prefix="/api/policies", tags=["Policies"])


@router.get("", response_model=PolicyListResponse)
async def list_policies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    policy_type: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List policies.
    Customers see only their own policies.
    Admins/Officers see all policies.
    """
    query = select(Policy)

    if current_user.role == "CUSTOMER":
        query = query.where(Policy.customer_id == current_user.id)
    if status:
        query = query.where(Policy.status == status)
    if policy_type:
        query = query.where(Policy.policy_type == policy_type)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    query = query.order_by(Policy.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    policies = result.scalars().all()

    return PolicyListResponse(policies=policies, total=total, page=page, page_size=page_size)


@router.get("/my-policies", response_model=List[PolicyOut])
async def get_my_policies(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Customer: Get list of owned policies."""
    result = await db.execute(
        select(Policy)
        .where(Policy.customer_id == current_user.id)
        .order_by(Policy.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{policy_id}", response_model=PolicyOut)
async def get_policy(
    policy_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get policy details."""
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    # Customers can only see their own policies
    if current_user.role == "CUSTOMER" and policy.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return policy


@router.post("", response_model=PolicyOut, status_code=status.HTTP_201_CREATED)
async def create_policy(
    payload: PolicyCreate,
    current_admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Create a new policy for a customer."""
    # Verify customer exists
    result = await db.execute(select(User).where(User.id == payload.customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    policy = Policy(**payload.model_dump())
    db.add(policy)
    await db.flush()

    await create_audit_log(
        db=db,
        action="CREATE_POLICY",
        entity_type="policy",
        entity_id=policy.id,
        user_id=current_admin.id,
        new_value={"policy_number": policy.policy_number, "customer_id": payload.customer_id},
    )
    await db.commit()
    await db.refresh(policy)
    return policy


@router.put("/{policy_id}", response_model=PolicyOut)
async def update_policy(
    policy_id: str,
    payload: PolicyUpdate,
    current_admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Update a policy."""
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    update_data = payload.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(policy, key, value)

    await create_audit_log(
        db=db,
        action="UPDATE_POLICY",
        entity_type="policy",
        entity_id=policy_id,
        user_id=current_admin.id,
        new_value=update_data,
    )
    await db.commit()
    await db.refresh(policy)
    return policy


@router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_policy(
    policy_id: str,
    current_admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Delete a policy (only if no claims exist)."""
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()
    # Verify no claims are attached to this policy
    from app.models.claim import Claim
    claim_count_res = await db.execute(
        select(func.count(Claim.id)).where(Claim.policy_id == policy_id)
    )
    claims_count = claim_count_res.scalar() or 0
    if claims_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete policy with {claims_count} existing claim(s)",
        )

    await db.delete(policy)
    await create_audit_log(
        db=db,
        action="DELETE_POLICY",
        entity_type="policy",
        entity_id=policy_id,
        user_id=current_admin.id,
    )
    await db.commit()
