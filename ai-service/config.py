"""Configuration management for AI Service."""

import json
from functools import lru_cache
from typing import Any

from pydantic import AliasChoices, Field
from pydantic import field_validator
from pydantic.fields import FieldInfo
from pydantic_settings import (
    BaseSettings,
    DotEnvSettingsSource,
    EnvSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)


_PATH_LIST_FIELDS = frozenset({"deepagent_skills_paths", "deepagent_memory_paths"})


class _PathListEnvSourceMixin:
    """Allow comma-separated list strings for selected settings fields."""

    def prepare_field_value(  # type: ignore[override]
        self,
        field_name: str,
        field: FieldInfo,
        value: Any,
        value_is_complex: bool,
    ) -> Any:
        if field_name in _PATH_LIST_FIELDS and isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            if not stripped.startswith("["):
                return [item.strip() for item in stripped.split(",") if item.strip()]
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class _PathListEnvSettingsSource(_PathListEnvSourceMixin, EnvSettingsSource):
    pass


class _PathListDotEnvSettingsSource(_PathListEnvSourceMixin, DotEnvSettingsSource):
    pass


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

    # LLM API Key (platform-managed)
    deepseek_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("DEEPSEEK_API_KEY"),
    )

    # DeepAgent / LangGraph Settings
    ai_state_postgres_url: str = ""  # Postgres URL for checkpoint store (ai_state schema)

    # Backend→AI-Service auth token
    ai_internal_token: str = Field(
        default="",
        validation_alias=AliasChoices(
            "AI_INTERNAL_TOKEN",
            "AI_SERVICE_INTERNAL_TOKEN",  # backward-compatible fallback
        ),
    )

    # MCP tool source
    qjudge_mcp_url: str = "http://qjudge-mcp:9000/mcp"
    deepagent_skills_paths: list[str] = ["/app/.deepagents/skills/"]
    deepagent_memory_paths: list[str] = ["/app/.deepagents/AGENTS.md"]

    # CORS Settings (for development)
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8000"]

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        model_config = settings_cls.model_config
        return (
            init_settings,
            _PathListEnvSettingsSource(
                settings_cls,
                case_sensitive=model_config.get("case_sensitive"),
                env_prefix=model_config.get("env_prefix"),
                env_nested_delimiter=model_config.get("env_nested_delimiter"),
                env_nested_max_split=model_config.get("env_nested_max_split"),
                env_ignore_empty=model_config.get("env_ignore_empty"),
                env_parse_none_str=model_config.get("env_parse_none_str"),
                env_parse_enums=model_config.get("env_parse_enums"),
            ),
            _PathListDotEnvSettingsSource(
                settings_cls,
                env_file=model_config.get("env_file"),
                env_file_encoding=model_config.get("env_file_encoding"),
                case_sensitive=model_config.get("case_sensitive"),
                env_prefix=model_config.get("env_prefix"),
                env_nested_delimiter=model_config.get("env_nested_delimiter"),
                env_nested_max_split=model_config.get("env_nested_max_split"),
                env_ignore_empty=model_config.get("env_ignore_empty"),
                env_parse_none_str=model_config.get("env_parse_none_str"),
                env_parse_enums=model_config.get("env_parse_enums"),
            ),
            file_secret_settings,
        )

    @staticmethod
    def _parse_env_path_list(value: Any) -> Any:
        """Accept native list, JSON array, or comma-separated string."""
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            return []
        if stripped.startswith("["):
            return json.loads(stripped)
        return [item.strip() for item in stripped.split(",") if item.strip()]

    @field_validator("deepagent_skills_paths", "deepagent_memory_paths", mode="before")
    @classmethod
    def _coerce_path_lists(cls, value: Any) -> Any:
        return cls._parse_env_path_list(value)



@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
