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

    # Test MongoDB connection and create indexes
    try:
        from app.database.mongodb import init_mongo_indexes, ping_mongo
        mongo_ok = await ping_mongo()
        if mongo_ok:
            logger.info("MongoDB connection verified successfully.")
            await init_mongo_indexes()
            try:
                from app.database.mongodb import get_mongo_db
                from app.database.postgres import AsyncSessionLocal
                from app.models.user import User
                from sqlalchemy import select

                mongo_db = get_mongo_db()
                async with AsyncSessionLocal() as db:
                    result = await db.execute(select(User))
                    existing_users = result.scalars().all()
                    for u in existing_users:
                        doc = {
                            "id": u.id,
                            "full_name": u.full_name,
                            "email": u.email,
                            "phone": u.phone,
                            "address": u.address,
                            "role": u.role,
                            "is_active": u.is_active,
                            "created_at": u.created_at.isoformat() if u.created_at else None,
                            "updated_at": u.updated_at.isoformat() if u.updated_at else None,
                        }
                        if u.role == "CUSTOMER":
                            await mongo_db["customers"].update_one(
                                {"id": u.id}, {"$set": doc}, upsert=True
                            )
                        await mongo_db["users"].update_one(
                            {"id": u.id}, {"$set": doc}, upsert=True
                        )
                logger.info(f"MongoDB records synchronized ({len(existing_users)} users).")
            except Exception as sync_err:
                logger.warning(f"MongoDB user synchronization note: {sync_err}")
        else:
            logger.warning("MongoDB not reachable at startup — document metadata features will run in limited mode.")
    except Exception as e:
        logger.warning(f"MongoDB startup check note: {e}")

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
cors_origins = settings.cors_origins_list
has_wildcard = "*" in cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if has_wildcard else cors_origins,
    allow_origin_regex=r"https://.*\.onrender\.com" if not has_wildcard else None,
    allow_credentials=not has_wildcard,
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
from app.routers import notifications, analytics, ai, websocket, reports

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
app.include_router(reports.router)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["Health"])
async def health_check():
    """
    Comprehensive system and database health check endpoint.
    Performs live pings on PostgreSQL and MongoDB without revealing credentials.
    """
    from app.database.postgres import get_postgres_health
    from app.database.mongodb import get_mongo_health

    pg_health = await get_postgres_health()
    mongo_health = await get_mongo_health()

    pg_ok = pg_health.get("status") == "connected"
    mongo_ok = mongo_health.get("status") == "connected"

    if pg_ok and mongo_ok:
        overall_status = "healthy"
    elif pg_ok or mongo_ok:
        overall_status = "degraded"
    else:
        overall_status = "unhealthy"

    return {
        "status": overall_status,
        "app": settings.APP_NAME,
        "version": settings.VERSION,
        "environment": settings.APP_ENV,
        "services": {
            "postgres": pg_health,
            "mongodb": mongo_health,
        },
    }


# ─── Root Redirect ─────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def root():
    return {"message": f"Welcome to {settings.APP_NAME} API", "docs": "/api/docs"}
