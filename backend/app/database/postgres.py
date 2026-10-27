from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# ─── SQLAlchemy async engine ─────────────────────────────────────────────────
engine = create_async_engine(
    settings.async_database_url,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# ─── Base declarative class ──────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ─── Dependency ─────────────────────────────────────────────────────────────
async def get_db() -> AsyncSession:
    """FastAPI dependency: yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def ping_postgres() -> bool:
    """Health check: ping PostgreSQL with a lightweight query."""
    try:
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.error(f"PostgreSQL ping failed: {exc}")
        return False


async def get_postgres_health() -> dict:
    """Detailed health check for PostgreSQL."""
    import time
    start = time.perf_counter()
    try:
        from sqlalchemy import text
        async with engine.connect() as conn:
            res = await conn.execute(text("SELECT current_database();"))
            db_name = res.scalar()
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        return {
            "status": "connected",
            "latency_ms": latency_ms,
            "database": db_name,
        }
    except Exception as exc:
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.warning(f"PostgreSQL health check failed: {exc}")
        return {
            "status": "unavailable",
            "latency_ms": latency_ms,
            "error": "Database unreachable or refused connection",
        }


async def create_all_tables() -> None:
    """Create all tables on startup (development only; use Alembic in production)."""
    async with engine.begin() as conn:
        from app.models import user, policy, claim, claim_timeline  # noqa
        from app.models import claim_review, document_request, settlement  # noqa
        from app.models import notification, audit_log  # noqa
        await conn.run_sync(Base.metadata.create_all)
    logger.info("PostgreSQL tables created/verified.")
