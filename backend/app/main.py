"""
InsureClaim AI — Main FastAPI Application
AI-Powered Insurance Claim Processing and Settlement Management System
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.core.config import settings
from app.core.logging_config import setup_logging, get_logger
from app.database.postgres import create_all_tables
from app.database.mongodb import close_mongo_connection, ping_mongo

# Setup logging early
setup_logging()
logger = get_logger(__name__)


# ─── Lifespan (startup / shutdown) ──────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup tasks and shutdown cleanup."""
    logger.info(f"Starting {settings.APP_NAME} v{settings.VERSION}...")

    # Create upload directories
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.UPLOAD_DIR, "claims").mkdir(parents=True, exist_ok=True)
    Path("app/ai/model_weights").mkdir(parents=True, exist_ok=True)

    # Initialize PostgreSQL tables
    try:
        await create_all_tables()
        logger.info("PostgreSQL ready.")
    except Exception as e:
        logger.error(f"PostgreSQL initialization error: {e}")

    # Test MongoDB connection
    try:
        mongo_ok = await ping_mongo()
        if mongo_ok:
            logger.info("MongoDB ready.")
            try:
                from app.database.mongodb import get_mongo_db
                from app.database.postgres import AsyncSessionLocal
                from app.models.user import User
                from sqlalchemy import select

                mongo_db = get_mongo_db()
                async with AsyncSessionLocal() as db:
                    result = await db.execute(select(User).where(User.role == "CUSTOMER"))
                    existing_customers = result.scalars().all()
                    for c in existing_customers:
                        doc = {
                            "id": c.id,
                            "full_name": c.full_name,
                            "email": c.email,
                            "phone": c.phone,
                            "address": c.address,
                            "role": "CUSTOMER",
                            "is_active": c.is_active,
                            "password_hash": c.password_hash,
                            "created_at": c.created_at.isoformat() if c.created_at else None,
                            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                        }
                        await mongo_db["customers"].update_one(
                            {"id": c.id}, {"$set": doc}, upsert=True
                        )
                        await mongo_db["users"].update_one(
                            {"id": c.id}, {"$set": doc}, upsert=True
                        )
                logger.info("MongoDB customers synchronized.")
            except Exception as sync_err:
                logger.warning(f"MongoDB customer sync skipped: {sync_err}")
        else:
            logger.warning("MongoDB not reachable — document features will be limited.")
    except Exception as e:
        logger.warning(f"MongoDB startup check failed: {e}")

    logger.info(f"{settings.APP_NAME} started successfully in {settings.APP_ENV} mode.")
    yield

    # Shutdown
    await close_mongo_connection()
    logger.info(f"{settings.APP_NAME} shutdown complete.")


# ─── Create Application ──────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Powered Insurance Claim Processing and Settlement Management System",
    version=settings.VERSION,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)


# ─── Middleware ───────────────────────────────────────────────────────────────

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Global Exception Handler ─────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception at {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."},
    )


# ─── Prometheus Metrics ───────────────────────────────────────────────────────
if settings.PROMETHEUS_ENABLED:
    try:
        from prometheus_fastapi_instrumentator import Instrumentator
        Instrumentator().instrument(app).expose(app, endpoint="/metrics")
        logger.info("Prometheus metrics enabled at /metrics")
    except ImportError:
        logger.warning("prometheus-fastapi-instrumentator not installed — metrics disabled")


# ─── Register Routers ─────────────────────────────────────────────────────────
from app.routers import auth, users, customers, policies, claims, documents, settlements
from app.routers import notifications, analytics, ai, websocket

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(customers.router)
app.include_router(policies.router)
app.include_router(claims.router)
app.include_router(documents.router)
app.include_router(settlements.router)
app.include_router(notifications.router)
app.include_router(analytics.router)
app.include_router(ai.router)
app.include_router(websocket.router)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["Health"])
async def health_check():
    """System health check endpoint."""
    from app.database.mongodb import ping_mongo
    mongo_ok = await ping_mongo()
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.VERSION,
        "environment": settings.APP_ENV,
        "services": {
            "postgres": "connected",
            "mongodb": "connected" if mongo_ok else "unavailable",
        },
    }


# ─── Root Redirect ─────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def root():
    return {"message": f"Welcome to {settings.APP_NAME} API", "docs": "/api/docs"}
