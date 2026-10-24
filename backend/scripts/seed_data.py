"""
InsureClaim AI — Development Seed Data Script (Idempotent)
Creates or updates demo users, policies, claims, timelines, settlements,
and synchronizes with MongoDB for testing and demonstration.
Run: python scripts/seed_data.py
"""

import asyncio
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# Add backend root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.postgres import AsyncSessionLocal, create_all_tables
from app.database.mongodb import get_mongo_db, init_mongo_indexes, ping_mongo
from app.core.security import get_password_hash
from app.models.user import User
from app.models.policy import Policy
from app.models.claim import Claim
from app.models.claim_timeline import ClaimTimeline
from app.models.settlement import Settlement
from app.models.notification import Notification


def uid():
    return str(uuid.uuid4())


async def get_or_create_user(
    db: AsyncSession,
    full_name: str,
    email: str,
    raw_password: str,
    phone: str,
    role: str,
    address: str | None = None,
) -> User:
    res = await db.execute(select(User).where(User.email == email))
    user = res.scalar_one_or_none()
    if not user:
        user = User(
            id=uid(),
            full_name=full_name,
            email=email,
            password_hash=get_password_hash(raw_password),
            phone=phone,
            role=role,
            address=address,
            is_active=True,
        )
        db.add(user)
        await db.flush()
    else:
        user.password_hash = get_password_hash(raw_password)
        user.role = role
        user.full_name = full_name
        user.is_active = True
        await db.flush()
    return user


async def get_or_create_policy(
    db: AsyncSession,
    policy_number: str,
    customer_id: str,
    policy_type: str,
    coverage_amount: float,
    premium_amount: float,
    deductible_amount: float,
    start_date: date,
    expiry_date: date,
    status: str = "ACTIVE",
) -> Policy:
    res = await db.execute(select(Policy).where(Policy.policy_number == policy_number))
    pol = res.scalar_one_or_none()
    if not pol:
        pol = Policy(
            id=uid(),
            policy_number=policy_number,
            customer_id=customer_id,
            policy_type=policy_type,
            coverage_amount=coverage_amount,
            premium_amount=premium_amount,
            deductible_amount=deductible_amount,
            start_date=start_date,
            expiry_date=expiry_date,
            status=status,
        )
        db.add(pol)
        await db.flush()
    return pol


async def get_or_create_claim(
    db: AsyncSession,
    claim_number: str,
    policy_id: str,
    customer_id: str,
    incident_type: str,
    incident_date: date,
    incident_location: str,
    description: str,
    requested_amount: float,
    status: str,
    approved_amount: float | None = None,
    fraud_score: float | None = None,
    risk_level: str | None = None,
    assigned_officer_id: str | None = None,
    rejection_reason: str | None = None,
) -> Claim:
    res = await db.execute(select(Claim).where(Claim.claim_number == claim_number))
    claim = res.scalar_one_or_none()
    if not claim:
        claim = Claim(
            id=uid(),
            claim_number=claim_number,
            policy_id=policy_id,
            customer_id=customer_id,
            incident_type=incident_type,
            incident_date=incident_date,
            incident_location=incident_location,
            description=description,
            requested_amount=requested_amount,
            approved_amount=approved_amount,
            status=status,
            fraud_score=fraud_score,
            risk_level=risk_level,
            assigned_officer_id=assigned_officer_id,
            rejection_reason=rejection_reason,
        )
        db.add(claim)
        await db.flush()
    return claim


async def seed():
    print("=" * 60)
    print("INSURECLAIM AI — DATABASE SEED & VERIFICATION SCRIPT")
    print("=" * 60)

    print("1. Creating PostgreSQL relational tables...")
    await create_all_tables()

    today = date.today()

    async with AsyncSessionLocal() as db:
        print("2. Seeding users for exactly three core roles...")

        # ── Admin ──────────────────────────────────────────────────
        admin = await get_or_create_user(
            db, "System Admin", "admin@insureclaim.com", "Admin@1234",
            "+91-9800000001", "ADMIN", "HQ Security Operations, Mumbai"
        )

        # ── Claim Officers ────────────────────────────────────────
        officer1 = await get_or_create_user(
            db, "Rajesh Kumar", "officer1@insureclaim.com", "Officer@1234",
            "+91-9800000010", "CLAIM_OFFICER", "Adjudication Branch, Pune"
        )
        officer2 = await get_or_create_user(
            db, "Priya Sharma", "officer2@insureclaim.com", "Officer@1234",
            "+91-9800000011", "CLAIM_OFFICER", "Fraud Investigation Unit, Bangalore"
        )

        # ── Customers ─────────────────────────────────────────────
        customer1 = await get_or_create_user(
            db, "Amit Verma", "amit@example.com", "Customer@1234",
            "+91-9900000001", "CUSTOMER", "102 Silver Oak, Koregaon Park, Pune"
        )
        customer2 = await get_or_create_user(
            db, "Sunita Patel", "sunita@example.com", "Customer@1234",
            "+91-9900000002", "CUSTOMER", "45 Green Acres, Indiranagar, Bangalore"
        )
        customer3 = await get_or_create_user(
            db, "Ravi Mehta", "ravi@example.com", "Customer@1234",
            "+91-9900000003", "CUSTOMER", "B-12 Hill View, Andheri West, Mumbai"
        )
        print("   Users ready.")

        # ── Policies ──────────────────────────────────────────────
        print("3. Seeding insurance policies...")
        policy1 = await get_or_create_policy(
            db, "POL-2025-MOT-001", customer1.id, "Motor Vehicle",
            500000, 12000, 5000, today - timedelta(days=180), today + timedelta(days=185), "ACTIVE"
        )
        policy2 = await get_or_create_policy(
            db, "POL-2025-HLT-002", customer1.id, "Health",
            300000, 8000, 2000, today - timedelta(days=90), today + timedelta(days=275), "ACTIVE"
        )
        policy3 = await get_or_create_policy(
            db, "POL-2025-MOT-003", customer2.id, "Motor Vehicle",
            800000, 18000, 8000, today - timedelta(days=60), today + timedelta(days=305), "ACTIVE"
        )
        policy4 = await get_or_create_policy(
            db, "POL-2025-HLT-004", customer3.id, "Health",
            500000, 15000, 3000, today - timedelta(days=30), today + timedelta(days=335), "ACTIVE"
        )
        policy5 = await get_or_create_policy(
            db, "POL-2024-MOT-005", customer2.id, "Property",
            2000000, 25000, 10000, today - timedelta(days=400), today - timedelta(days=30), "EXPIRED"
        )
        print("   Policies ready.")

        # ── Claims ────────────────────────────────────────────────
        print("4. Seeding insurance claims covering all workflow states...")
        claim1 = await get_or_create_claim(
            db, "CLM20260001", policy1.id, customer1.id, "Motor Vehicle Accident",
            today - timedelta(days=15), "NH-48 Junction, Pune",
            "Frontal collision with commercial truck while turning. Damaged bumper, bonnet, and radiator.",
            85000, "SETTLED", approved_amount=72000, fraud_score=0.12, risk_level="LOW",
            assigned_officer_id=officer1.id
        )
        claim2 = await get_or_create_claim(
            db, "CLM20260002", policy3.id, customer2.id, "Motor Vehicle Accident",
            today - timedelta(days=5), "MG Road Signal, Bangalore",
            "Rear-ended at traffic signal during heavy rain. Broken tail lamps and trunk dent.",
            45000, "UNDER_OFFICER_REVIEW", fraud_score=0.22, risk_level="LOW",
            assigned_officer_id=officer1.id
        )
        claim3 = await get_or_create_claim(
            db, "CLM20260003", policy2.id, customer1.id, "Medical Emergency",
            today - timedelta(days=2), "Apollo Hospital, Mumbai",
            "Emergency appendectomy procedure and subsequent 3-day post-operative ICU care.",
            285000, "UNDER_FRAUD_REVIEW", fraud_score=0.78, risk_level="HIGH",
            assigned_officer_id=officer2.id
        )
        claim4 = await get_or_create_claim(
            db, "CLM20260004", policy4.id, customer3.id, "Medical Emergency",
            today - timedelta(days=8), "City Care Hospital, Delhi",
            "Inpatient treatment for acute dengue with severe platelet count drop.",
            120000, "APPROVAL_PENDING", approved_amount=110000, fraud_score=0.18, risk_level="LOW",
            assigned_officer_id=officer2.id
        )
        claim5 = await get_or_create_claim(
            db, "CLM20260005", policy1.id, customer1.id, "Motor Vehicle Accident",
            today - timedelta(days=1), "Dadar Mall Parking, Mumbai",
            "Left wing mirror snapped and passenger door scratched in underground parking.",
            8000, "DRAFT"
        )
        claim6 = await get_or_create_claim(
            db, "CLM20260006", policy3.id, customer2.id, "Theft",
            today - timedelta(days=20), "Andheri Metro Station, Mumbai",
            "Vehicle stolen from designated parking overnight. Key handover pending.",
            800000, "REJECTED", fraud_score=0.91, risk_level="VERY_HIGH",
            rejection_reason="Claim amount exceeds policy coverage. FIR jurisdiction does not match registered vehicle domicile.",
            assigned_officer_id=officer1.id
        )
        print("   Claims ready.")

        # ── Settlements ───────────────────────────────────────────
        res_s = await db.execute(select(Settlement).where(Settlement.claim_id == claim1.id))
        if not res_s.scalar_one_or_none():
            settlement1 = Settlement(
                id=uid(), claim_id=claim1.id, approved_amount=72000, payment_amount=67000,
                payment_reference="NEFT/20261024/0001", payment_method="NEFT",
                payment_status="COMPLETED", processed_by=admin.id,
                completed_at=datetime.now(timezone.utc),
            )
            db.add(settlement1)

        # ── Timelines ─────────────────────────────────────────────
        res_t = await db.execute(select(ClaimTimeline).where(ClaimTimeline.claim_id == claim1.id))
        if not res_t.scalars().first():
            timelines = [
                ClaimTimeline(id=uid(), claim_id=claim1.id, status="DRAFT", description="Draft initiated by customer", created_by=customer1.id, created_at=datetime.now(timezone.utc) - timedelta(days=15)),
                ClaimTimeline(id=uid(), claim_id=claim1.id, status="SUBMITTED", description="Claim submitted with initial incident photos", created_by=customer1.id, created_at=datetime.now(timezone.utc) - timedelta(days=14)),
                ClaimTimeline(id=uid(), claim_id=claim1.id, status="UNDER_OFFICER_REVIEW", description="Assigned to Rajesh Kumar for document scrutiny", created_by=admin.id, created_at=datetime.now(timezone.utc) - timedelta(days=12)),
                ClaimTimeline(id=uid(), claim_id=claim1.id, status="APPROVED", description="Officer and Admin approved for ₹72,000", created_by=admin.id, created_at=datetime.now(timezone.utc) - timedelta(days=7)),
                ClaimTimeline(id=uid(), claim_id=claim1.id, status="SETTLED", description="Settlement payment of ₹67,000 processed via NEFT (after ₹5,000 deductible)", created_by=admin.id, created_at=datetime.now(timezone.utc) - timedelta(days=3)),
            ]
            db.add_all(timelines)

        await db.commit()

    # 5. MongoDB Sync & Indexing
    print("5. Initializing MongoDB collections, indexes, and document cache...")
    if await ping_mongo():
        await init_mongo_indexes()
        mdb = get_mongo_db()
        async with AsyncSessionLocal() as db:
            users_res = await db.execute(select(User))
            for u in users_res.scalars().all():
                udoc = {
                    "id": u.id,
                    "full_name": u.full_name,
                    "email": u.email,
                    "phone": u.phone,
                    "address": u.address,
                    "role": u.role,
                    "is_active": u.is_active,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                }
                if u.role == "CUSTOMER":
                    await mdb["customers"].update_one({"id": u.id}, {"$set": udoc}, upsert=True)
                await mdb["users"].update_one({"id": u.id}, {"$set": udoc}, upsert=True)
        print("   MongoDB synchronized successfully.")
    else:
        print("   MongoDB is not running or unreachable. Skipping MongoDB cache sync.")

    print("\n" + "=" * 60)
    print("DEMO CREDENTIALS FOR PROJECT REVIEW")
    print("=" * 60)
    print("ADMIN:          admin@insureclaim.com        / Admin@1234")
    print("CLAIM OFFICER:  officer1@insureclaim.com     / Officer@1234")
    print("CLAIM OFFICER:  officer2@insureclaim.com     / Officer@1234")
    print("CUSTOMER 1:     amit@example.com             / Customer@1234")
    print("CUSTOMER 2:     sunita@example.com           / Customer@1234")
    print("CUSTOMER 3:     ravi@example.com             / Customer@1234")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(seed())
