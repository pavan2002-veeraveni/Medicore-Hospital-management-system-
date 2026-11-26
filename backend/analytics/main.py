"""Vercel Python entrypoint re-exporting FastAPI application."""

from app.main import app

__all__ = ["app"]
