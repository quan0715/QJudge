"""SQLAlchemy repository adapters for the AI domain."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models import Principal, Session, Usage

from .models import MessageRow, RunRow, SessionRow


def _session_from_row(row: SessionRow) -> Session:
    return Session(
        id=row.session_id,
        owner=Principal(issuer=row.owner_issuer, subject=row.owner_subject),
        title=row.title,
        context=dict(row.context),
    )


def _owned_session_ids(principal: Principal, session_id: UUID):
    return select(SessionRow.session_id).where(
        SessionRow.session_id == session_id,
        SessionRow.owner_issuer == principal.issuer,
        SessionRow.owner_subject == principal.subject,
    )


class SqlAlchemySessionRepository:
    def __init__(self, db_session: AsyncSession) -> None:
        self._db_session = db_session

    async def create(self, session: Session) -> Session:
        row = SessionRow(
            session_id=session.id,
            owner_issuer=session.owner.issuer,
            owner_subject=session.owner.subject,
            title=session.title,
            context=dict(session.context),
        )
        self._db_session.add(row)
        await self._db_session.flush()
        return _session_from_row(row)

    async def list_for_owner(self, principal: Principal) -> list[Session]:
        rows = (
            await self._db_session.scalars(
                select(SessionRow)
                .where(
                    SessionRow.owner_issuer == principal.issuer,
                    SessionRow.owner_subject == principal.subject,
                )
                .order_by(SessionRow.updated_at.desc(), SessionRow.session_id)
            )
        ).all()
        return [_session_from_row(row) for row in rows]

    async def get_for_owner(
        self, principal: Principal, session_id: UUID
    ) -> Session | None:
        row = await self._db_session.scalar(
            select(SessionRow).where(
                SessionRow.session_id == session_id,
                SessionRow.owner_issuer == principal.issuer,
                SessionRow.owner_subject == principal.subject,
            )
        )
        return _session_from_row(row) if row is not None else None

    async def update(self, session: Session) -> Session:
        row = await self._db_session.scalar(
            update(SessionRow)
            .where(
                SessionRow.session_id == session.id,
                SessionRow.owner_issuer == session.owner.issuer,
                SessionRow.owner_subject == session.owner.subject,
            )
            .values(title=session.title, context=dict(session.context))
            .returning(SessionRow)
        )
        if row is None:
            return session
        return _session_from_row(row)

    async def clear_for_owner(
        self, principal: Principal, session_id: UUID
    ) -> Session | None:
        row = await self._db_session.scalar(
            select(SessionRow)
            .where(
                SessionRow.session_id == session_id,
                SessionRow.owner_issuer == principal.issuer,
                SessionRow.owner_subject == principal.subject,
            )
            .with_for_update()
        )
        if row is None:
            return None

        await self._db_session.execute(
            delete(MessageRow).where(
                MessageRow.session_id.in_(_owned_session_ids(principal, session_id))
            )
        )
        row.next_message_ordinal = 1
        await self._db_session.flush()
        return _session_from_row(row)

    async def delete(self, principal: Principal, session_id: UUID) -> None:
        await self._db_session.execute(
            delete(SessionRow).where(
                SessionRow.session_id == session_id,
                SessionRow.owner_issuer == principal.issuer,
                SessionRow.owner_subject == principal.subject,
            )
        )


class SqlAlchemyUsageReader:
    def __init__(self, db_session: AsyncSession) -> None:
        self._db_session = db_session

    async def get_for_owner(self, principal: Principal) -> Usage:
        result = (
            await self._db_session.execute(
                select(
                    func.coalesce(func.sum(RunRow.input_tokens), 0),
                    func.coalesce(func.sum(RunRow.output_tokens), 0),
                )
                .select_from(RunRow)
                .join(SessionRow, SessionRow.session_id == RunRow.session_id)
                .where(
                    SessionRow.owner_issuer == principal.issuer,
                    SessionRow.owner_subject == principal.subject,
                )
            )
        ).one()
        return Usage(input_tokens=int(result[0]), output_tokens=int(result[1]))
