"""AI Service — FastAPI application entry point (v2: DeepAgent)."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from models.schemas import HealthResponse, ModelsResponse
from routers import chat_router
from services.deepagent_runner import DeepAgentRunner
from services.model_factory import MODEL_INFO
from services.tool_client import InternalToolClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — init DeepAgent runner on startup."""
    settings = get_settings()

    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set — LLM calls will fail")
    if not settings.hmac_secret.strip():
        raise RuntimeError("HMAC_SECRET must be set and non-empty")
    if not settings.ai_internal_token.strip():
        raise RuntimeError("AI_INTERNAL_TOKEN must be set and non-empty")

    # Initialize tool client for internal API calls
    tool_client = InternalToolClient(
        backend_url=settings.backend_internal_url,
        service_id=settings.ai_service_id,
        hmac_secret=settings.hmac_secret,
    )

    # Initialize DeepAgent runner with Postgres checkpointer
    runner = DeepAgentRunner(
        tool_client=tool_client,
        checkpoint_db_url=settings.ai_state_postgres_url,
        skills_dir=settings.skills_dir,
    )

    if settings.ai_state_postgres_url:
        await runner.setup()
        logger.info("DeepAgent runner initialized with Postgres checkpointer.")
    else:
        logger.warning("AI_STATE_POSTGRES_URL not set — checkpointing disabled.")

    app.state.deepagent_runner = runner

    yield

    # Shutdown
    await runner.shutdown()
    logger.info("AI Service shut down.")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="AI Service for QJudge — DeepAgent powered problem generation",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(chat_router)

    return app


app = create_app()


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    settings = get_settings()
    checkpoint_status = "connected" if settings.ai_state_postgres_url else "not_configured"
    overall = "healthy" if settings.anthropic_api_key else "degraded"
    return HealthResponse(
        status=overall,
        version=settings.app_version,
        checkpoint_db=checkpoint_status,
    )


@app.get("/api/models", response_model=ModelsResponse, tags=["models"])
async def list_models() -> ModelsResponse:
    """Return available model options."""
    return ModelsResponse(models=MODEL_INFO)


@app.get("/", tags=["root"])
async def root():
    settings = get_settings()
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
    }
