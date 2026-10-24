from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.dependencies import get_current_user, get_admin
from app.database.postgres import get_db
from app.models.user import User
from app.schemas.user import UserOut, UserUpdate, UserAdminUpdate, UserListResponse
from app.schemas.auth import RegisterRequest
from app.services.audit_service import create_audit_log

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: str | None = Query(None),
    search: str | None = Query(None),
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: List all users with optional filtering."""
    query = select(User)
    if role:
        query = query.where(User.role == role)
    if search:
        query = query.where(
            User.full_name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%")
        )

    # Count
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    # Paginate
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    return UserListResponse(users=users, total=total, page=page, page_size=page_size)


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    payload: RegisterRequest,
    current_admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Create a new system user with specified role."""
    from app.core.security import get_password_hash

    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User with this email already exists")

    new_user = User(
        full_name=payload.full_name,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        phone=payload.phone,
        role=payload.role or "CUSTOMER",
        is_active=True,
    )
    db.add(new_user)
    await db.flush()
    await create_audit_log(
        db=db,
        action="CREATE_USER",
        entity_type="user",
        entity_id=new_user.id,
        user_id=current_admin.id,
        new_value={"email": payload.email, "role": new_user.role},
    )
    await db.commit()
    await db.refresh(new_user)

    # Persist to MongoDB
    try:
        from app.database.mongodb import get_mongo_db
        mongo_db = get_mongo_db()
        user_doc = {
            "id": new_user.id,
            "full_name": new_user.full_name,
            "email": new_user.email,
            "phone": new_user.phone,
            "address": new_user.address,
            "role": new_user.role,
            "is_active": new_user.is_active,
            "password_hash": new_user.password_hash,
            "created_at": new_user.created_at.isoformat() if new_user.created_at else None,
            "updated_at": new_user.updated_at.isoformat() if new_user.updated_at else None,
        }
        if new_user.role == "CUSTOMER":
            await mongo_db["customers"].update_one(
                {"id": new_user.id},
                {"$set": user_doc},
                upsert=True,
            )
        await mongo_db["users"].update_one(
            {"id": new_user.id},
            {"$set": user_doc},
            upsert=True,
        )
    except Exception as mongo_err:
        pass

    return new_user


@router.get("/me/profile", response_model=UserOut)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """Get own profile."""
    return current_user


@router.put("/me/profile", response_model=UserOut)
async def update_my_profile(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update own profile."""
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.phone is not None:
        current_user.phone = payload.phone
    if payload.address is not None:
        current_user.address = payload.address
    if payload.profile_picture_url is not None:
        current_user.profile_picture_url = payload.profile_picture_url

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: str,
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Get a user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    payload: UserAdminUpdate,
    current_admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Update a user's information or role."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = payload.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(user, key, value)

    await create_audit_log(
        db=db,
        action="UPDATE_USER",
        entity_type="user",
        entity_id=user_id,
        user_id=current_admin.id,
        new_value=update_data,
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}/status", response_model=UserOut)
async def toggle_user_status(
    user_id: str,
    is_active: bool,
    current_admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Activate or deactivate a user account."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = is_active
    await create_audit_log(
        db=db,
        action="DEACTIVATE_USER" if not is_active else "ACTIVATE_USER",
        entity_type="user",
        entity_id=user_id,
        user_id=current_admin.id,
    )
    await db.commit()
    await db.refresh(user)
    return user
