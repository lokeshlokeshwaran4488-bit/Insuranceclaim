# Render Production Deployment Guide
## MERN Stack Insurance Claim Processing and Settlement Management System

This guide outlines the end-to-end process for deploying the **InsureClaim AI** MERN stack system from GitHub to **[Render](https://render.com)**.

---

## 1. System Architecture on Render

```mermaid
graph TD
    User["End User Browser"]
    
    subgraph Render Cloud
        Frontend["Render Static Site<br/>(React 19 + Vite)<br/>https://insureclaim-frontend.onrender.com"]
        Backend["Render Web Service<br/>(Node.js + Express + Mongoose)<br/>https://insureclaim-backend.onrender.com"]
        Storage["Attached Disk / Local Volume<br/>/app/uploads"]
    end
    
    subgraph Cloud Databases & AI
        MDB[("MongoDB Atlas<br/>insurance_claims")]
        OpenAI["OpenAI GPT-4o API<br/>(Advisory Summarization)"]
    end

    User -->|HTTPS| Frontend
    Frontend -->|REST API + JWT Bearer| Backend
    Backend -->|Mongoose (MongoDB ODM)| MDB
    Backend -->|Multipart Upload| Storage
    Backend -->|HTTPS JSON| OpenAI
```

---

## 2. Option A: Automated 1-Click Deployment (Render Blueprints - Recommended)

The repository includes a ready-to-use [`render.yaml`](./render.yaml) blueprint specification for the MERN stack.

### Steps:
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** > **Blueprint**.
3. Connect your GitHub repository.
4. Render will parse `render.yaml` and provision:
   - **Backend Web Service**: `insureclaim-backend` (Node.js 22 runtime)
   - **Frontend Static Site**: `insureclaim-frontend` (React 19 + Vite)
5. During setup, supply the secret:
   - `MONGODB_URI`: Your MongoDB connection string (e.g., `mongodb+srv://...`).
   - `OPENAI_API_KEY`: (Optional) Your OpenAI API key for GPT-4o.
6. Click **Apply**. Render will automatically build both services.

---

## 3. Option B: Manual Service Creation

### Service 1: Node.js Express Backend
- **Environment**: Node.js
- **Root Directory**: `backend`
- **Build Command**: `npm ci`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`
- **Environment Variables**:
  - `NODE_ENV`: `production`
  - `CLIENT_URL`: `https://insureclaim-frontend.onrender.com`
  - `MONGODB_URI`: `mongodb+srv://...` (your MongoDB Atlas connection string)
  - `JWT_SECRET`: Secure 32+ character secret
  - `AES_ENCRYPTION_KEY`: 32-character key for data encryption

### Service 2: React Frontend Static Site
- **Environment**: Static Site
- **Root Directory**: `frontend`
- **Build Command**: `npm ci && npm run build`
- **Publish Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_URL`: `https://insuranceclaim-m0ij.onrender.com`
