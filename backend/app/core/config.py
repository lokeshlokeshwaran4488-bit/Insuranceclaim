from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import os


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "InsureClaim AI"
    APP_ENV: str = "development"
    DEBUG: bool = True
    VERSION: str = "1.0.0"

    # Security
    SECRET_KEY: str = "change-this-in-production-must-be-at-least-32-characters"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    # PostgreSQL
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "insurance_claims"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/insurance_claims"

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if "sslmode=" in url:
            url = url.replace("sslmode=", "ssl=")
        return url

    # MongoDB
    MONGO_HOST: str = "localhost"
    MONGO_PORT: int = 27017
    MONGO_DB: str = "insurance_claims_docs"
    MONGO_URL: str = "mongodb://localhost:27017"
    MONGODB_URI: str | None = None
    MONGODB_DATABASE: str | None = None
    MONGODB_TIMEOUT_MS: int = 5000

    @property
    def mongodb_connection_url(self) -> str:
        return self.MONGODB_URI or self.MONGO_URL

    @property
    def mongodb_database_name(self) -> str:
        return self.MONGODB_DATABASE or self.MONGO_DB

    # AES Encryption
    AES_ENCRYPTION_KEY: str = "your-aes-256-key-exactly-32-bytes=="

    # AI Services
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    # File Uploads
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 10
    ALLOWED_EXTENSIONS: str = "pdf,jpg,jpeg,png"

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Monitoring
    PROMETHEUS_ENABLED: bool = True

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 100

    @property
    def cors_origins_list(self) -> List[str]:
        if not self.CORS_ORIGINS or self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def allowed_extensions_list(self) -> List[str]:
        return [ext.strip().lower() for ext in self.ALLOWED_EXTENSIONS.split(",")]

    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    model_config = {"env_file": ".env", "case_sensitive": True, "extra": "ignore"}


settings = Settings()
