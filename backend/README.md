# InsureClaim AI — MERN Stack Backend API Service

Express.js and Node.js REST API backend powering the AI-Powered Insurance Claim Processing and Settlement Management System using **MongoDB and Mongoose exclusively**.

## Architecture & Database
- **Database**: MongoDB (`mongodb://127.0.0.1:27017/insurance_claims`) via Mongoose ODM.
- **Backend Framework**: Express.js on Node.js 22.
- **Authentication**: JWT authentication with `bcryptjs` password hashing.
- **Storage**: Multer file uploads with SHA-256 integrity checks.
- **Real-time**: WebSockets (`/ws/:userId`) for live notifications.
- **AI Verification**: Integrated multi-point document and image verification engine with explainability metrics.

## Running on Local Machine

1. Ensure MongoDB service is running on `127.0.0.1:27017`.
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Seed database:
   ```powershell
   node scripts/seedData.js
   ```
4. Start development server:
   ```powershell
   node server.js
   ```
   Server runs on `http://localhost:5000`.

## Running Automated Tests
```powershell
npm test
```
All automated tests verify:
- Health checks (MongoDB only, no SQL/PostgreSQL)
- Authentication & RBAC for Admin, Officer, and Customer
- Customer claim lifecycle (draft, submission, timeline, uploads)
- Officer review, document requests, and AI verification
- Admin clarification, approval, and settlement processing
- Analytics dashboards, audit logs, and CSV report exports with formula injection sanitization.
