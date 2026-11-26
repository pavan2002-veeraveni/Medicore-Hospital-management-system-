# =============================================================================
# MediCore Analytics - API Key Authentication Middleware
# =============================================================================

from fastapi import HTTPException, Security, Depends
from fastapi.security import APIKeyHeader
from app.config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    """Verify the API key for internal service authentication."""
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="API key is required",
        )
    if api_key != settings.API_KEY:
        raise HTTPException(
            status_code=403,
            detail="Invalid API key",
        )
    return api_key
