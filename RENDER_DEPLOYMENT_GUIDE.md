# Render Production Deployment Guide
## AI-Powered Insurance Claim Processing and Settlement Management System

This guide outlines the end-to-end process for deploying the **InsureClaim AI** system from GitHub to **[Render](https://render.com)**.

---

## 1. System Architecture on Render

```mermaid
graph TD
    User["End User Browser"]
    
    subgraph Render Cloud
        Frontend["Render Static Site<br/>(React 19 + Vite)<br/>https://insureclaim-frontend.onrender.com"]
        Backend["Render Web Service<br/>(FastAPI + Python 3.10)<br/>https://insureclaim-backend.onrender.com"]
        PG[("Render Managed PostgreSQL<br/>insurance_claims")]
        Storage["Attached Disk / Local Volume<br/>/var/data/uploads"]
    end
    
    subgraph Cloud Databases & AI
        MDB[("MongoDB Atlas<br/>insurance_claims_docs")]
        OpenAI["OpenAI GPT-4o API<br/>(Summarization & Risk)"]
    end

    User -->|HTTPS| Frontend
    Frontend -->|REST API + JWT Bearer| Backend
    Backend -->|asyncpg (Async)| PG
    Backend -->|Motor Driver (Async)| MDB
    Backend -->|Multipart Upload| Storage
    Backend -->|HTTPS JSON| OpenAI
```

---

## 2. Option A: Automated 1-Click Deployment (Render Blueprints - Recommended)

The repository includes a ready-to-use [`render.yaml`](./render.yaml) blueprint specification.

### Steps:
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** > **Blueprint**.
3. Connect your GitHub repository: `https://github.com/lokeshlokeshwaran4488-bit/Insuranceclaim`.
4. Render will parse `render.yaml` and provision:
   - **PostgreSQL Database**: `insureclaim-postgres`
   - **Backend Web Service**: `insureclaim-backend`
   - **Frontend Static Site**: `insureclaim-frontend`
5. During setup, supply the two un-synced secrets when prompted:
   - `MONGODB_URI`: Your MongoDB Atlas connection string.
   - `OPENAI_API_KEY`: (Optional) Your OpenAI API key for GPT-4o.
6. Click **Apply**. Render will automatically build and link both services!

---

## 3. Option B: Manual Step-by-Step Deployment via Render Dashboard

If you prefer configuring each service individually:

### Step 1: Set Up MongoDB Atlas (Document & AI Intelligence Store)
1. Sign in to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a free **M0 Sandbox** cluster (e.g. in AWS or Google Cloud).
3. Under **Security** > **Database Access**:
   - Create a user (e.g., `dbadmin`) with read/write privileges.
4. Under **Security** > **Network Access**:
   - Add IP Address: `0.0.0.0/0` (Allow access from anywhere, required for dynamic cloud hosting like Render).
5. Click **Connect** > **Drivers** (Python):
   - Copy connection string:
     ```
     mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
   - Replace `<username>` and `<password>` with your database credentials.

---

### Step 2: Deploy PostgreSQL on Render (Relational Core Store)
1. On Render Dashboard, click **New +** > **PostgreSQL**.
2. Set configuration:
   - **Name**: `insureclaim-postgres`
   - **Database**: `insurance_claims`
   - **User**: `postgres`
   - **Region**: Oregon (ensure all services share the same region)
   - **Plan**: Free
3. Click **Create Database**.
4. Once created, copy the **Internal Database URL** (e.g. `postgres://postgres:password@dpg-xxxx:5432/insurance_claims`).
   *(Note: The application automatically translates `postgres://` to `postgresql+asyncpg://` and handles SSL).*

---

### Step 3: Deploy the Backend (FastAPI Web Service)
1. On Render Dashboard, click **New +** > **Web Service**.
2. Select your repository: `https://github.com/lokeshlokeshwaran4488-bit/Insuranceclaim`.
3. Configure the service:
   - **Name**: `insureclaim-backend`
   - **Region**: Oregon (same as PostgreSQL)
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**:
     ```bash
     pip install -r requirements.txt
     ```
   - **Start Command**:
     ```bash
     uvicorn app.main:app --host 0.0.0.0 --port $PORT
     ```
   - **Health Check Path**: `/api/health`
4. Expand **Environment Variables** and add:

   | Key | Value | Description |
   | :--- | :--- | :--- |
   | `APP_NAME` | `InsureClaim AI` | Application Name |
   | `APP_ENV` | `production` | Deployment Environment |
   | `DEBUG` | `false` | Disable debug stack traces |
   | `SECRET_KEY` | *(Generate a 32+ character random string)* | JWT Signing Secret |
   | `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token Lifetime (24 Hours) |
   | `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh Token Lifetime |
   | `DATABASE_URL` | *(Paste Internal Database URL from Step 2)* | PostgreSQL Connection |
   | `MONGODB_URI` | *(Paste MongoDB Atlas connection string from Step 1)* | MongoDB Connection |
   | `MONGODB_DATABASE` | `insurance_claims_docs` | MongoDB Database Name |
   | `CORS_ORIGINS` | `*` *(or your frontend onrender.com URL)* | Allowed Frontend Domains |
   | `UPLOAD_DIR` | `./uploads` | Local upload directory |
   | `MAX_FILE_SIZE_MB` | `10` | Max file upload limit |
   | `ALLOWED_EXTENSIONS` | `pdf,jpg,jpeg,png` | Permitted file extensions |
   | `OPENAI_API_KEY` | *(Your OpenAI Key or leave empty for heuristic fallback)* | GPT-4o API Key |
   | `OPENAI_MODEL` | `gpt-4o` | Model identifier |
   | `PROMETHEUS_ENABLED` | `true` | Metrics endpoint |

5. Click **Create Web Service**. Wait for build completion and verify healthy status at `https://<your-backend>.onrender.com/api/health`.

---

### Step 4: Deploy the Frontend (React Static Site)
1. On Render Dashboard, click **New +** > **Static Site**.
2. Select your repository: `https://github.com/lokeshlokeshwaran4488-bit/Insuranceclaim`.
3. Configure the site:
   - **Name**: `insureclaim-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**:
     ```bash
     npm install && npm run build
     ```
   - **Publish Directory**: `dist`
4. Expand **Environment Variables**:
   - `VITE_API_URL`: `https://insureclaim-backend.onrender.com` *(Use your actual backend URL from Step 3)*
5. **Configure Single Page Application (SPA) Routing**:
   - The repository contains [`frontend/public/_redirects`](./frontend/public/_redirects) with:
     ```
     /*    /index.html   200
     ```
   - Render automatically recognizes this file, ensuring that refreshing pages on `/dashboard`, `/claims/:id`, etc., loads the application without 404 errors.
6. Click **Create Static Site**.

---

## 4. Seeding Production Demonstration Data

To populate the deployed database with demo accounts, policies, and sample claims:

1. In the Render Dashboard, go to your **`insureclaim-backend`** service.
2. Click the **Shell** tab on the left navigation bar.
3. In the interactive terminal, execute:
   ```bash
   python scripts/seed_data.py
   ```
4. Output:
   ```
   ============================================================
   InsureClaim AI — Seed Summary
   ============================================================
   Users created / verified    : 4
     - System Admin            : admin@insureclaim.com / Admin@1234
     - Claim Officer 1         : officer1@insureclaim.com / Officer@1234
     - Claim Officer 2         : officer2@insureclaim.com / Officer@1234
     - Policyholder (Customer) : amit@example.com / Customer@1234
   Policies active             : 2
   Claims seeded               : 3
   Documents synchronized      : 3
   AI Analyses ready           : 3
   Settlements recorded        : 1
   ============================================================
   ```

---

## 5. Document & File Storage Details

- **Upload Validation**: Files are checked for magic-byte binary signatures (`%PDF`, `\xFF\xD8\xFF`, `\x89PNG`), hashed with SHA-256 for tampering detection, and stored inside `UPLOAD_DIR/claims/<claim_id>/`.
- **Persistent Storage**:
  - On Render Free Tier, files are stored on container disk during runtime.
  - For long-term production persistence across service re-deployments, attach a **Render Persistent Disk**:
    1. In **`insureclaim-backend`** > **Disks** > **Add Disk**.
    2. Name: `insureclaim-uploads`. Mount Path: `/var/data/uploads`. Size: 1 GB+.
    3. Update Environment Variable `UPLOAD_DIR=/var/data/uploads`.

---

## 6. Verification and Smoke Testing

Once deployment finishes, verify the system:

1. **Backend Health Check**:
   Visit `https://<backend-domain>.onrender.com/api/health`
   Expected response:
   ```json
   {
     "status": "healthy",
     "app": "InsureClaim AI",
     "services": {
       "postgres": { "status": "connected" },
       "mongodb": { "status": "connected" }
     }
   }
   ```
2. **Interactive Swagger Docs**:
   Visit `https://<backend-domain>.onrender.com/api/docs`
3. **Frontend Application**:
   Visit `https://<frontend-domain>.onrender.com`
   - Log in with `admin@insureclaim.com` / `Admin@1234` -> View KPI dashboard, user list, and CSV exports.
   - Log in with `officer1@insureclaim.com` / `Officer@1234` -> View review queue, AI risk analysis, and claim approval.
   - Log in with `amit@example.com` / `Customer@1234` -> Submit a claim and upload evidence documents.
