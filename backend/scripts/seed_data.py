"""
Development seed data script.
Creates dummy users, policies, claims, and settlements for testing.
Run: python scripts/seed_data.py
"""

import asyncio
import sys
import os
from datetime import date, timedelta
from pathlib import Path

# Add backend root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession
from app.database.postgres import AsyncSessionLocal, create_all_tables
from app.core.security import get_password_hash
from app.models.user import User
from app.models.policy import Policy
from app.models.claim import Claim
from app.models.claim_timeline import ClaimTimeline
from app.models.settlement import Settlement
from app.models.notification import Notification

import uuid


def uid():
    return str(uuid.uuid4())


async def seed():
    print("Creating tables...")
    await create_all_tables()

    async with AsyncSessionLocal() as db:
        print("Seeding users...")

        # ── Admin ──────────────────────────────────────────────────
        admin = User(
            id=uid(), full_name="System Admin", email="admin@insureclaim.com",
            password_hash=get_password_hash("Admin@1234"),
            phone="+91-9800000001", role="ADMIN", is_active=True,
        )
        db.add(admin)

        # ── Claim Officers ────────────────────────────────────────
        officer1 = User(
            id=uid(), full_name="Rajesh Kumar", email="officer1@insureclaim.com",
            password_hash=get_password_hash("Officer@1234"),
            phone="+91-9800000010", role="CLAIM_OFFICER", is_active=True,
        )
        officer2 = User(
            id=uid(), full_name="Priya Sharma", email="officer2@insureclaim.com",
            password_hash=get_password_hash("Officer@1234"),
            phone="+91-9800000011", role="CLAIM_OFFICER", is_active=True,
        )
        db.add_all([officer1, officer2])

        # ── Customers ─────────────────────────────────────────────
        customer1 = User(
            id=uid(), full_name="Amit Verma", email="amit@example.com",
            password_hash=get_password_hash("Customer@1234"),
            phone="+91-9900000001", role="CUSTOMER", is_active=True,
        )
        customer2 = User(
            id=uid(), full_name="Sunita Patel", email="sunita@example.com",
            password_hash=get_password_hash("Customer@1234"),
            phone="+91-9900000002", role="CUSTOMER", is_active=True,
        )
        customer3 = User(
            id=uid(), full_name="Ravi Mehta", email="ravi@example.com",
            password_hash=get_password_hash("Customer@1234"),
            phone="+91-9900000003", role="CUSTOMER", is_active=True,
        )
        db.add_all([customer1, customer2, customer3])

        await db.flush()
        print("Users created.")

        # ── Policies ──────────────────────────────────────────────
        today = date.today()

        policy1 = Policy(
            id=uid(), policy_number="POL-2025-MOT-001", customer_id=customer1.id,
            policy_type="Motor Vehicle", coverage_amount=500000, premium_amount=12000,
            deductible_amount=5000, start_date=today - timedelta(days=180),
            expiry_date=today + timedelta(days=185), status="ACTIVE",
        )
        policy2 = Policy(
            id=uid(), policy_number="POL-2025-HLT-002", customer_id=customer1.id,
            policy_type="Health", coverage_amount=300000, premium_amount=8000,
            deductible_amount=2000, start_date=today - timedelta(days=90),
            expiry_date=today + timedelta(days=275), status="ACTIVE",
        )
        policy3 = Policy(
            id=uid(), policy_number="POL-2025-MOT-003", customer_id=customer2.id,
            policy_type="Motor Vehicle", coverage_amount=800000, premium_amount=18000,
            deductible_amount=8000, start_date=today - timedelta(days=60),
            expiry_date=today + timedelta(days=305), status="ACTIVE",
        )
        policy4 = Policy(
            id=uid(), policy_number="POL-2025-HLT-004", customer_id=customer3.id,
            policy_type="Health", coverage_amount=500000, premium_amount=15000,
            deductible_amount=3000, start_date=today - timedelta(days=30),
            expiry_date=today + timedelta(days=335), status="ACTIVE",
        )
        policy5 = Policy(
            id=uid(), policy_number="POL-2024-MOT-005", customer_id=customer2.id,
            policy_type="Property", coverage_amount=2000000, premium_amount=25000,
            deductible_amount=10000, start_date=today - timedelta(days=400),
            expiry_date=today - timedelta(days=30), status="EXPIRED",
        )
        db.add_all([policy1, policy2, policy3, policy4, policy5])

        await db.flush()
        print("Policies created.")

        # ── Claims ────────────────────────────────────────────────

        # Claim 1: Approved + Settled
        claim1 = Claim(
            id=uid(), claim_number="CLM20260001", policy_id=policy1.id,
            customer_id=customer1.id, incident_type="Motor Vehicle Accident",
            incident_date=today - timedelta(days=15), incident_location="NH-48, Pune",
            description="My car was hit by another vehicle at a junction. The front bumper and bonnet are damaged.",
            requested_amount=85000, approved_amount=72000, status="SETTLED",
            fraud_score=0.12, risk_level="LOW", assigned_officer_id=officer1.id,
        )

        # Claim 2: Under Officer Review
        claim2 = Claim(
            id=uid(), claim_number="CLM20260002", policy_id=policy3.id,
            customer_id=customer2.id, incident_type="Motor Vehicle Accident",
            incident_date=today - timedelta(days=5), incident_location="MG Road, Bangalore",
            description="Rear ended at traffic signal. Rear bumper damaged and tail lights broken.",
            requested_amount=45000, status="UNDER_OFFICER_REVIEW",
            fraud_score=0.23, risk_level="LOW", assigned_officer_id=officer1.id,
        )

        # Claim 3: High Risk — Fraud Review
        claim3 = Claim(
            id=uid(), claim_number="CLM20260003", policy_id=policy2.id,
            customer_id=customer1.id, incident_type="Medical Emergency",
            incident_date=today - timedelta(days=2), incident_location="Apollo Hospital, Mumbai",
            description="Emergency surgery required. Total medical bills amount to ₹2,85,000.",
            requested_amount=285000, status="UNDER_FRAUD_REVIEW",
            fraud_score=0.82, risk_level="VERY_HIGH", assigned_officer_id=officer2.id,
        )

        # Claim 4: Approval Pending
        claim4 = Claim(
            id=uid(), claim_number="CLM20260004", policy_id=policy4.id,
            customer_id=customer3.id, incident_type="Medical Emergency",
            incident_date=today - timedelta(days=8), incident_location="City Hospital, Delhi",
            description="Hospitalized for 5 days due to dengue fever. Need reimbursement for hospital bills.",
            requested_amount=120000, approved_amount=110000, status="APPROVAL_PENDING",
            fraud_score=0.18, risk_level="LOW", assigned_officer_id=officer2.id,
        )

        # Claim 5: Draft
        claim5 = Claim(
            id=uid(), claim_number="CLM20260005", policy_id=policy1.id,
            customer_id=customer1.id, incident_type="Motor Vehicle Accident",
            incident_date=today - timedelta(days=1), incident_location="Dadar, Mumbai",
            description="Side mirror damaged in parking lot.",
            requested_amount=8000, status="DRAFT",
        )

        # Claim 6: Rejected
        claim6 = Claim(
            id=uid(), claim_number="CLM20260006", policy_id=policy3.id,
            customer_id=customer2.id, incident_type="Theft",
            incident_date=today - timedelta(days=20), incident_location="Andheri, Mumbai",
            description="Vehicle stolen from parking area.",
            requested_amount=800000, status="REJECTED",
            fraud_score=0.91, risk_level="VERY_HIGH",
            rejection_reason="Claim amount exceeds policy coverage. FIR not matching incident location.",
            assigned_officer_id=officer1.id,
        )

        db.add_all([claim1, claim2, claim3, claim4, claim5, claim6])
        await db.flush()
        print("Claims created.")

        # ── Timeline entries for claim1 ───────────────────────────
        timelines = [
            ClaimTimeline(id=uid(), claim_id=claim1.id, status="DRAFT",
                          description="Claim draft created", created_by=customer1.id,
                          created_at=__import__('datetime').datetime.now(__import__('datetime').timezone.utc) - __import__('datetime').timedelta(days=15)),
            ClaimTimeline(id=uid(), claim_id=claim1.id, status="SUBMITTED",
                          description="Claim submitted by customer.", created_by=customer1.id),
            ClaimTimeline(id=uid(), claim_id=claim1.id, status="UNDER_OFFICER_REVIEW",
                          description="Assigned to officer Rajesh Kumar.", created_by=admin.id),
            ClaimTimeline(id=uid(), claim_id=claim1.id, status="APPROVED",
                          description="Claim approved for ₹72,000.", created_by=admin.id),
            ClaimTimeline(id=uid(), claim_id=claim1.id, status="SETTLEMENT_PENDING",
                          description="Settlement initiated by admin.", created_by=admin.id),
            ClaimTimeline(id=uid(), claim_id=claim1.id, status="SETTLED",
                          description="Payment of ₹67,000 processed (after ₹5,000 deductible).", created_by=admin.id),
        ]
        db.add_all(timelines)

        # ── Settlement for claim1 ─────────────────────────────────
        settlement1 = Settlement(
            id=uid(), claim_id=claim1.id, approved_amount=72000, payment_amount=67000,
            payment_reference="NEFT/20260905/0001", payment_method="NEFT",
            payment_status="COMPLETED", processed_by=admin.id,
        )
        db.add(settlement1)

        # ── Notifications ──────────────────────────────────────────
        db.add(Notification(
            id=uid(), user_id=customer1.id, type="CLAIM_SUBMITTED",
            title="Claim Submitted", message="Your claim CLM20260001 has been submitted.",
            claim_id=claim1.id,
        ))
        db.add(Notification(
            id=uid(), user_id=customer1.id, type="CLAIM_APPROVED",
            title="Claim Approved!", message="Your claim CLM20260001 has been approved for ₹72,000.",
            claim_id=claim1.id, is_read=True,
        ))
        db.add(Notification(
            id=uid(), user_id=customer1.id, type="SETTLEMENT_COMPLETED",
            title="Payment Received", message="Settlement payment of ₹67,000 has been processed.",
            claim_id=claim1.id,
        ))

        await db.commit()
        print("\n[SUCCESS] Seed data created successfully!\n")

        print("=" * 55)
        print("TEST CREDENTIALS (EXACTLY 3 ROLES)")
        print("=" * 55)
        print(f"Admin:          admin@insureclaim.com        / Admin@1234")
        print(f"Claim Officer:  officer1@insureclaim.com     / Officer@1234")
        print(f"Claim Officer:  officer2@insureclaim.com     / Officer@1234")
        print(f"Customer 1:     amit@example.com             / Customer@1234")
        print(f"Customer 2:     sunita@example.com           / Customer@1234")
        print(f"Customer 3:     ravi@example.com             / Customer@1234")
        print("=" * 55)


if __name__ == "__main__":
    asyncio.run(seed())
