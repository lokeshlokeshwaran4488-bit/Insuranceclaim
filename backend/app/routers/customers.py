import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.dependencies import get_admin, get_current_user
from app.core.security import get_password_hash
from app.database.postgres import get_db
from app.database.mongodb import get_mongo_db
from app.models.user import User
from app.schemas.user import UserOut
from app.schemas.customer import CustomerCreate, CustomerListResponse
from app.services.audit_service import create_audit_log
from app.core.logging_config import get_logger

router = APIRouter(prefix="/api/customers", tags=["Customers"])
logger = get_logger(__name__)


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str | None = Query(None),
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: List registered customers with search and pagination."""
    query = select(User).where(User.role == "CUSTOMER")
    if search:
        search_filter = f"%{search}%"
        query = query.where(
            User.full_name.ilike(search_filter) | User.email.ilike(search_filter)
        )

    # Count total customers matching query
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    # Sort latest first, paginate
    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    customers = result.scalars().all()

    return CustomerListResponse(
        customers=customers,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreate,
    current_admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Create a new customer, save in PostgreSQL and MongoDB."""
    # 1. Check duplicate email in PostgreSQL
    existing_pg = await db.execute(select(User).where(User.email == payload.email))
    if existing_pg.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )

    # 2. Check duplicate email in MongoDB
    try:
        mongo_db = get_mongo_db()
        existing_mongo = await mongo_db["customers"].find_one({"email": payload.email})
        if existing_mongo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists",
            )
    except Exception as mongo_check_err:
        logger.warning(f"MongoDB duplicate pre-check warning: {mongo_check_err}")

    # 3. Securely hash password using bcrypt
    password_hash = get_password_hash(payload.password)
    now = datetime.now(timezone.utc)
    new_user_id = str(uuid.uuid4())

    # 4. Create and save in PostgreSQL
    new_customer = User(
        id=new_user_id,
        full_name=payload.full_name,
        email=payload.email,
        password_hash=password_hash,
        phone=payload.phone,
        address=payload.address,
        role="CUSTOMER",
        is_active=True,
    )
    db.add(new_customer)
    await db.flush()

    # 5. Create Audit Log
    await create_audit_log(
        db=db,
        action="CREATE_CUSTOMER",
        entity_type="customer",
        entity_id=new_customer.id,
        user_id=current_admin.id,
        new_value={
            "email": payload.email,
            "full_name": payload.full_name,
            "role": "CUSTOMER",
        },
    )
    await db.commit()
    await db.refresh(new_customer)

    # 6. Save customer document to MongoDB
    try:
        mongo_db = get_mongo_db()
        customer_doc = {
            "id": new_customer.id,
            "full_name": new_customer.full_name,
            "email": new_customer.email,
            "phone": new_customer.phone,
            "address": new_customer.address,
            "role": "CUSTOMER",
            "is_active": new_customer.is_active,
            "password_hash": new_customer.password_hash,
            "created_at": new_customer.created_at.isoformat() if new_customer.created_at else now.isoformat(),
            "updated_at": new_customer.updated_at.isoformat() if new_customer.updated_at else now.isoformat(),
        }
        await mongo_db["customers"].update_one(
            {"id": new_customer.id},
            {"$set": customer_doc},
            upsert=True,
        )
        await mongo_db["users"].update_one(
            {"id": new_customer.id},
            {"$set": customer_doc},
            upsert=True,
        )
        logger.info(f"Customer {new_customer.email} saved to MongoDB successfully.")
    except Exception as mongo_err:
        logger.error(f"Failed to persist customer to MongoDB: {mongo_err}")
        # Note: PostgreSQL commit has succeeded.

    return new_customer


@router.get("/{customer_id}", response_model=UserOut)
async def get_customer(
    customer_id: str,
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Get customer details by ID."""
    result = await db.execute(
        select(User).where((User.id == customer_id) & (User.role == "CUSTOMER"))
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    return customer
