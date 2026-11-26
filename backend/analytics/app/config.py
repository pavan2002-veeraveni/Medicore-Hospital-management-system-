# =============================================================================
# MediCore Analytics - Configuration
# =============================================================================

import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="ANALYTICS_",
        case_sensitive=True,
        extra="ignore",
    )

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False

    # Database (read-only access)
    DATABASE_URL: str = "postgresql://medicore_readonly:readonly_password@localhost:5432/medicore_db"

    # API Authentication
    API_KEY: str = "change-this-to-a-secure-api-key"

    # Backend API
    BACKEND_API_URL: str = "http://localhost:4000/api/v1"

    # CORS
    CORS_ORIGIN: str = "http://localhost:3000"

    # Logging
    LOG_LEVEL: str = "INFO"

    @model_validator(mode="after")
    def _fallback_vercel_database_url(self) -> "Settings":
        # Fall back to shared DATABASE_URL (e.g. Neon on Vercel) when ANALYTICS_DATABASE_URL is unset
        if "ANALYTICS_DATABASE_URL" not in os.environ and os.environ.get("DATABASE_URL"):
            self.DATABASE_URL = os.environ["DATABASE_URL"]
        if self.DATABASE_URL.startswith("postgres://"):
            self.DATABASE_URL = self.DATABASE_URL.replace("postgres://", "postgresql://", 1)
        return self


settings = Settings()
