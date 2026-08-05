"""Token usage queries for one authenticated principal."""

from __future__ import annotations

from collections.abc import Callable

from domain.models import Principal, Usage, UsageSummary
from domain.ports import UnitOfWork


class UsageService:
    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    async def get_usage(self, principal: Principal) -> Usage:
        async with self._uow_factory() as uow:
            return await uow.usage.get_for_owner(principal)

    async def get_usage_summary(self, principal: Principal) -> UsageSummary:
        async with self._uow_factory() as uow:
            return await uow.usage.get_summary_for_owner(principal)
