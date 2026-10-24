from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

_mongo_client: AsyncIOMotorClient | None = None


def get_mongo_client() -> AsyncIOMotorClient:
    """Return the shared Motor client (singleton)."""
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(settings.MONGO_URL)
    return _mongo_client


def get_mongo_db() -> AsyncIOMotorDatabase:
    """Return the Motor database instance."""
    client = get_mongo_client()
    return client[settings.MONGO_DB]


async def close_mongo_connection() -> None:
    """Close the MongoDB connection on shutdown."""
    global _mongo_client
    if _mongo_client:
        _mongo_client.close()
        _mongo_client = None
        logger.info("MongoDB connection closed.")


async def ping_mongo() -> bool:
    """Health check: ping MongoDB."""
    try:
        client = get_mongo_client()
        await client.admin.command("ping")
        return True
    except Exception as exc:
        logger.error(f"MongoDB ping failed: {exc}")
        return False
