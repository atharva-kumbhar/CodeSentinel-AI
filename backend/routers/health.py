"""
Health Router
Provides health check and service status endpoints.
"""

from fastapi import APIRouter
from models.schemas import HealthResponse
from services.orchestrator import ReviewOrchestrator
from config import settings

router = APIRouter()
orchestrator = ReviewOrchestrator()


@router.get("/health", response_model=HealthResponse, summary="Health Check")
async def health_check():
    """Check the health status of the application and all connected services."""
    services_status = orchestrator.get_services_status()

    return HealthResponse(
        status="operational",
        version="1.0.0",
        services={
            "api": True,
            "github": services_status.get("github", False),
            "nvidia_nim": services_status.get("nvidia_nim", False),
            "model": settings.NVIDIA_MODEL,
            "environment": settings.ENV,
        },
    )
