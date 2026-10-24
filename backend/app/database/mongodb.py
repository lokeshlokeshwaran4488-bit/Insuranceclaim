import time
from typing import Any, Dict
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

_mongo_client: AsyncIOMotorClient | None = None


def get_mongo_client() -> AsyncIOMotorClient:
    """
    Return the shared Motor async client (singleton).
    Configures safe timeouts and connection pool parameters.
    """
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(
            settings.mongodb_connection_url,
            serverSelectionTimeoutMS=settings.MONGODB_TIMEOUT_MS,
            connectTimeoutMS=settings.MONGODB_TIMEOUT_MS,
            maxPoolSize=50,
            minPoolSize=2,
            uuidRepresentation="standard",
        )
    return _mongo_client


def get_mongo_db() -> AsyncIOMotorDatabase:
    """Return the configured Motor database instance."""
    client = get_mongo_client()
    return client[settings.mongodb_database_name]


async def close_mongo_connection() -> None:
    """Close the MongoDB client connection on shutdown."""
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
        _mongo_client = None
        logger.info("MongoDB client connection gracefully closed.")


async def ping_mongo() -> bool:
    """Fast health check: ping MongoDB administrative interface."""
    try:
        client = get_mongo_client()
        await client.admin.command("ping")
        return True
    except (ConnectionFailure, ServerSelectionTimeoutError) as exc:
        logger.warning(f"MongoDB ping timed out or refused: {exc}")
        return False
    except Exception as exc:
        logger.error(f"MongoDB ping unexpected failure: {exc}")
        return False


async def get_mongo_health() -> Dict[str, Any]:
    """
    Detailed database health report for monitoring.
    Never exposes credentials or host authorization secrets.
    """
    start = time.perf_counter()
    try:
        client = get_mongo_client()
        await client.admin.command("ping")
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        db = get_mongo_db()
        collections = await db.list_collection_names()
        return {
            "status": "connected",
            "latency_ms": latency_ms,
            "database": settings.mongodb_database_name,
            "collections_count": len(collections),
            "collections": collections,
        }
    except Exception as exc:
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.warning(f"MongoDB health inspection failed: {exc}")
        return {
            "status": "unavailable",
            "latency_ms": latency_ms,
            "database": settings.mongodb_database_name,
            "error": "Database unreachable or timed out",
        }


async def init_mongo_indexes() -> None:
    """
    Create necessary indexes on MongoDB collections for optimal query performance.
    Runs during application startup.
    """
    try:
        db = get_mongo_db()

        # 1. claim_documents indexes
        claim_docs_indexes = [
            IndexModel([("claim_id", ASCENDING)]),
            IndexModel([("customer_id", ASCENDING)]),
            IndexModel([("content_hash", ASCENDING)]),
            IndexModel([("upload_timestamp", DESCENDING)]),
        ]
        await db["claim_documents"].create_indexes(claim_docs_indexes)

        # 2. ai_analysis indexes
        ai_indexes = [
            IndexModel([("claim_id", ASCENDING)]),
            IndexModel([("analysis_type", ASCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
        ]
        await db["ai_analysis"].create_indexes(ai_indexes)

        # 3. customers collection indexes
        customer_indexes = [
            IndexModel([("id", ASCENDING)], unique=True, sparse=True),
            IndexModel([("email", ASCENDING)], unique=True, sparse=True),
        ]
        await db["customers"].create_indexes(customer_indexes)

        # 4. users collection indexes
        user_indexes = [
            IndexModel([("id", ASCENDING)], unique=True, sparse=True),
            IndexModel([("email", ASCENDING)], unique=True, sparse=True),
        ]
        await db["users"].create_indexes(user_indexes)

        logger.info("MongoDB collections and indexes successfully initialized.")
    except Exception as exc:
        logger.warning(f"MongoDB index creation skipped/failed: {exc}")

