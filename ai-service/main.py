"""AI Service - FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from models.schemas import HealthResponse, HealthStatus
from routers import chat_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("Starting AI Service...")
    settings = get_settings()

    # Check API key
    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set - Claude API calls will fail")

    yield

    # Shutdown
    logger.info("Shutting down AI Service...")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="AI Service for QJudge - Handles AI-powered problem generation",
        lifespan=lifespan,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(chat_router)

    return app


app = create_app()


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    """Health check endpoint.

    Returns the service status, Claude API connectivity,
    and number of loaded skills.
    """
    settings = get_settings()
    
    
    # Check Claude API status
    claude_status = "unknown"
    if settings.anthropic_api_key:
        claude_status = "connected"
    else:
        claude_status = "disconnected"

    # Determine overall status
    status = HealthStatus.HEALTHY
    if claude_status == "disconnected":
        status = HealthStatus.DEGRADED
    
    return HealthResponse(
        status=status,
        claude_api=claude_status,
        skills_loaded=0,
        version=settings.app_version,
    )


@app.get("/", tags=["root"])
async def root():
    """Root endpoint - service information."""
    settings = get_settings()
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
    }
