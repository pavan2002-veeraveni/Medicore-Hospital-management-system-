# =============================================================================
# MediCore Analytics - Configuration
# =============================================================================

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


settings = Settings()
