# InsureClaim AI — Backend API Service

FastAPI asynchronous backend powering the AI-Powered Insurance Claim Processing System.

## Architecture & Databases
- **PostgreSQL 18** (`backend/pgdata` cluster on port 5433 or standard port 5432): Manages core relational business records (`users`, `policies`, `claims`, `claim_timeline`, `settlements`, `audit_logs`).
- **MongoDB 8.0** (`mongodb://localhost:27017` / database `insurance_claims_docs`): Manages document upload metadata, binary SHA-256 content hashes, AI structured summaries, and multi-factor preliminary risk evaluations.

## Running on Windows

1. Ensure PostgreSQL is running on port 5433:
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\postgres.exe" -D ".\pgdata" -p 5433
   ```
2. Ensure MongoDB service is running on `127.0.0.1:27017`.
3. Seed database:
   ```powershell
   python scripts/seed_data.py
   ```
4. Start development server:
   ```powershell
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

## Running Automated Tests
```powershell
python -m pytest tests -v
```
All 17 automated tests verify database connectivity, health checks, authentication, RBAC authorization, claim lifecycle workflows, document security, and CSV formula injection sanitization.
