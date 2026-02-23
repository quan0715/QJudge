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

    # Claude Settings
    anthropic_api_key: str = ""
    claude_model: str = "haiku"  # 預設使用 Haiku（較快、較便宜）
    claude_max_turns: int = 10

    # CORS Settings (for development)
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8000"]

    # Skills directory
    skills_dir: str = "skills"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
