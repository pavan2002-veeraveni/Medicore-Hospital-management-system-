# =============================================================================
# MediCore Analytics - API Key Authentication Middleware
# =============================================================================

import hmac

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from app.config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str | None = Security(api_key_header)) -> str:
    """Verify the API key for internal service authentication using constant-time comparison."""
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="API key is required",
        )
    if not hmac.compare_digest(api_key, settings.API_KEY):
        raise HTTPException(
            status_code=403,
            detail="Invalid API key",
        )
    return api_key
