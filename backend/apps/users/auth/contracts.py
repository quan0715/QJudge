"""QAuth-compatible contracts used inside the current QJudge auth boundary."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


ProviderType = Literal["password", "oauth2", "oidc"]
ProviderCategory = Literal["campus", "social", "password"]


@dataclass(frozen=True)
class ProviderTokenSet:
    access_token: str = ""
    refresh_token: str = ""
    id_token: str = ""
    expires_at: int | None = None
    scope: str = ""
    token_type: str = "bearer"


@dataclass(frozen=True)
class NormalizedQAuthIdentity:
    provider_key: str
    provider_subject: str
    email: str | None
    username: str
    display_name: str = ""
    avatar_url: str = ""
    raw_profile: dict = field(default_factory=dict)


@dataclass(frozen=True)
class QAuthProviderOption:
    key: str
    type: ProviderType
    category: ProviderCategory
    display_name: str
    display_name_i18n_key: str = ""
    logo_url: str = ""


@dataclass(frozen=True)
class QAuthProviderConnection:
    key: str
    type: ProviderType
    issuer_url: str = ""
    authorization_url: str = ""
    token_url: str = ""
    userinfo_url: str = ""
    jwks_url: str = ""
    scope: str = "openid email profile"
    client_id_env: str = ""
    client_secret_env: str = ""
    claim_mapping: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class QAuthAccountLinkInput:
    identity: NormalizedQAuthIdentity
    token_set: ProviderTokenSet
