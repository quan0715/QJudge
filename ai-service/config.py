"""Configuration management for AI Service."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # API Settings
    app_name: str = "AI Service"
    app_version: str = "1.0.0"
    debug: bool = False

    # Anthropic Settings
    anthropic_api_key: str = ""

    # DeepAgent / LangGraph Settings
    ai_state_postgres_url: str = ""  # Postgres URL for checkpoint store (ai_state schema)
    default_model_id: str = "claude-sonnet"

    # Internal API (Tool Gateway)
    backend_internal_url: str = "http://backend:8000"
    ai_service_id: str = "ai-service-1"
    hmac_secret: str = ""

    # CORS Settings (for development)
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8000"]

    # Skills directory
    skills_dir: str = "skills"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
