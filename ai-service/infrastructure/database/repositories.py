"""SQLAlchemy repository adapters for the AI domain."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from application.event_reducer import EventProjection, reduce_run_event
from domain.models import (
    Message,
    Principal,
    Run,
    RunKind,
    RunStatus,
    Session,
    SessionDetail,
    StreamEvent,
    Usage,
    UsageSummary,
)
from domain.run_state import ACTIVE_EXECUTION_STATUSES

from .models import MessageRow, RunEventRow, RunRow, SessionRow

_TERMINAL_EVENT_TYPES = frozenset(
    {"run_completed", "run_failed", "run_cancelled"}
)


def _session_from_row(row: SessionRow) -> Session:
    return Session(
        id=row.session_id,
        owner=Principal(issuer=row.owner_issuer, subject=row.owner_subject),
        title=row.title,
        context=dict(row.context),
    )


def _run_from_row(row: RunRow) -> Run:
    return Run(
        id=row.run_id,
        session_id=row.session_id,
        status=RunStatus(row.status),
        kind=RunKind(row.kind),
        model_id=row.model_id,
        last_sequence=row.last_sequence,
        cancel_requested=row.cancel_requested,
        error_code=row.error_code,
        error_message=row.error_message,
        pause_payload=dict(row.pause_payload),
        usage=Usage(
            input_tokens=row.input_tokens,
            output_tokens=row.output_tokens,
        ),
    )


def _message_from_row(row: MessageRow) -> Message:
    return Message(
        session_id=row.session_id,
        ordinal=row.ordinal,
        run_id=row.run_id,
        role=row.role,
        content=row.content,
        metadata=dict(row.metadata_),
        created_at=row.created_at,
    )


def _event_from_row(row: RunEventRow) -> StreamEvent:
    return StreamEvent(
        run_id=row.run_id,
        sequence=row.sequence,
        event_type=row.event_type,
        payload=dict(row.payload),
        created_at=row.created_at,
    )


def _apply_run_projection(
    row: RunRow,
    assistant_row: MessageRow | None,
    projection: EventProjection,
    sequence: int,
) -> None:
    projected_run = projection.run
    row.status = projected_run.status.value
    row.cancel_requested = projected_run.cancel_requested
    row.error_code = projected_run.error_code
    row.error_message = projected_run.error_message
    row.pause_payload = dict(projected_run.pause_payload)
    row.input_tokens = projected_run.usage.input_tokens
    row.output_tokens = projected_run.usage.output_tokens

    if assistant_row is not None and projection.assistant is not None:
        assistant_row.content = projection.assistant.content
        assistant_row.metadata_ = {
            **projection.assistant.metadata,
            "run_id": str(row.run_id),
            "run_status": projected_run.status.value,
            "last_event_seq": sequence,
        }


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

    async def get_detail_for_owner(
        self, principal: Principal, session_id: UUID
    ) -> SessionDetail | None:
        row = await self._db_session.scalar(
            select(SessionRow).where(
                SessionRow.session_id == session_id,
                SessionRow.owner_issuer == principal.issuer,
                SessionRow.owner_subject == principal.subject,
            )
        )
        if row is None:
            return None
        message_rows = (
            await self._db_session.scalars(
                select(MessageRow)
                .join(SessionRow, SessionRow.session_id == MessageRow.session_id)
                .where(
                    MessageRow.session_id == session_id,
                    SessionRow.owner_issuer == principal.issuer,
                    SessionRow.owner_subject == principal.subject,
                )
                .order_by(MessageRow.ordinal)
            )
        ).all()
        return SessionDetail(
            session=_session_from_row(row),
            messages=tuple(_message_from_row(item) for item in message_rows),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    async def get_for_update(
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
        return _session_from_row(row) if row is not None else None

    async def update(
        self, principal: Principal, session: Session
    ) -> Session | None:
        row = await self._db_session.scalar(
            update(SessionRow)
            .where(
                SessionRow.session_id == session.id,
                SessionRow.owner_issuer == principal.issuer,
                SessionRow.owner_subject == principal.subject,
            )
            .values(title=session.title, context=dict(session.context))
            .returning(SessionRow)
        )
        if row is None:
            return None
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
        summary = await self.get_summary_for_owner(principal)
        return Usage(
            input_tokens=summary.total_input_tokens,
            output_tokens=summary.total_output_tokens,
        )

    async def get_summary_for_owner(
        self, principal: Principal
    ) -> UsageSummary:
        result = (
            await self._db_session.execute(
                select(
                    func.coalesce(func.sum(RunRow.input_tokens), 0),
                    func.coalesce(func.sum(RunRow.output_tokens), 0),
                    func.count(RunRow.run_id),
                    func.max(RunRow.updated_at),
                )
                .select_from(RunRow)
                .join(SessionRow, SessionRow.session_id == RunRow.session_id)
                .where(
                    SessionRow.owner_issuer == principal.issuer,
                    SessionRow.owner_subject == principal.subject,
                )
            )
        ).one()
        return UsageSummary(
            total_input_tokens=int(result[0]),
            total_output_tokens=int(result[1]),
            total_runs=int(result[2]),
            updated_at=result[3],
        )


class SqlAlchemyRunRepository:
    """Persist runs and their ordered event/message projections."""

    def __init__(self, db_session: AsyncSession) -> None:
        self._session = db_session

    async def create(self, run: Run) -> Run:
        row = RunRow(
            run_id=run.id,
            session_id=run.session_id,
            status=run.status.value,
            kind=run.kind.value,
            model_id=run.model_id,
            idempotency_key=f"run:{run.id}",
            error_code=run.error_code,
            error_message=run.error_message,
            pause_payload=dict(run.pause_payload),
            cancel_requested=run.cancel_requested,
            last_sequence=run.last_sequence,
            input_tokens=run.usage.input_tokens,
            output_tokens=run.usage.output_tokens,
        )
        self._session.add(row)
        await self._session.flush()
        return _run_from_row(row)

    async def get(self, run_id: UUID) -> Run | None:
        row = await self._session.get(RunRow, run_id)
        return _run_from_row(row) if row is not None else None

    async def get_for_owner(
        self, principal: Principal, run_id: UUID
    ) -> Run | None:
        row = await self._session.scalar(
            select(RunRow)
            .join(SessionRow, SessionRow.session_id == RunRow.session_id)
            .where(
                RunRow.run_id == run_id,
                SessionRow.owner_issuer == principal.issuer,
                SessionRow.owner_subject == principal.subject,
            )
        )
        return _run_from_row(row) if row is not None else None

    async def get_for_update(
        self, principal: Principal, run_id: UUID
    ) -> Run | None:
        row = await self._session.scalar(
            select(RunRow)
            .join(SessionRow, SessionRow.session_id == RunRow.session_id)
            .where(
                RunRow.run_id == run_id,
                SessionRow.owner_issuer == principal.issuer,
                SessionRow.owner_subject == principal.subject,
            )
            .with_for_update(of=RunRow)
        )
        return _run_from_row(row) if row is not None else None

    async def get_by_idempotency_key(
        self, session_id: UUID, idempotency_key: str
    ) -> Run | None:
        row = await self._session.scalar(
            select(RunRow).where(
                RunRow.session_id == session_id,
                RunRow.idempotency_key == idempotency_key,
            )
        )
        return _run_from_row(row) if row is not None else None

    async def create_queued(
        self, session_id: UUID, model_id: str, idempotency_key: str
    ) -> Run:
        row = RunRow(
            run_id=uuid4(),
            session_id=session_id,
            status=RunStatus.QUEUED.value,
            kind=RunKind.CHAT.value,
            model_id=model_id,
            idempotency_key=idempotency_key,
        )
        self._session.add(row)
        await self._session.flush()
        return _run_from_row(row)

    async def has_blocking_run(
        self, session_id: UUID, excluding: UUID
    ) -> bool:
        blocking = await self._session.scalar(
            select(RunRow.run_id)
            .where(
                RunRow.session_id == session_id,
                RunRow.run_id != excluding,
                RunRow.status.in_(
                    [status.value for status in ACTIVE_EXECUTION_STATUSES]
                ),
            )
            .limit(1)
        )
        return blocking is not None

    async def oldest_queued(
        self, session_id: UUID, excluding: UUID | None = None
    ) -> Run | None:
        statement = select(RunRow).where(
            RunRow.session_id == session_id,
            RunRow.status == RunStatus.QUEUED.value,
        )
        if excluding is not None:
            statement = statement.where(RunRow.run_id != excluding)
        row = await self._session.scalar(
            statement.order_by(RunRow.created_at, RunRow.run_id).limit(1)
        )
        return _run_from_row(row) if row is not None else None

    async def oldest_queued_after_terminal(self, run_id: UUID) -> Run | None:
        terminal = await self._session.get(RunRow, run_id)
        if terminal is None or RunStatus(terminal.status) not in {
            RunStatus.COMPLETED,
            RunStatus.FAILED,
            RunStatus.CANCELLED,
        }:
            return None

        # Serialize terminal handoff against new starts and Worker claims for
        # this session. The actual queue call remains outside this transaction.
        await self._session.scalar(
            select(SessionRow.session_id)
            .where(SessionRow.session_id == terminal.session_id)
            .with_for_update()
        )
        if await self.has_blocking_run(terminal.session_id, excluding=run_id):
            return None
        return await self.oldest_queued(terminal.session_id, excluding=run_id)

    async def update(self, run: Run) -> Run:
        row = await self._session.get(RunRow, run.id)
        if row is None:
            raise LookupError(f"Run not found: {run.id}")
        _apply_run_projection(row, None, EventProjection(run, None), run.last_sequence)
        row.kind = run.kind.value
        row.model_id = run.model_id
        row.last_sequence = run.last_sequence
        await self._session.flush()
        return _run_from_row(row)

    async def _latest_assistant_message(self, run_id: UUID) -> MessageRow | None:
        return await self._session.scalar(
            select(MessageRow)
            .where(MessageRow.run_id == run_id, MessageRow.role == "assistant")
            .order_by(MessageRow.ordinal.desc())
            .limit(1)
        )

    async def _latest_event(self, run_id: UUID) -> RunEventRow | None:
        return await self._session.scalar(
            select(RunEventRow)
            .where(RunEventRow.run_id == run_id)
            .order_by(RunEventRow.sequence.desc())
            .limit(1)
        )

    async def append_event(
        self, run_id: UUID, event: dict[str, Any]
    ) -> StreamEvent:
        run_row = await self._session.scalar(
            select(RunRow).where(RunRow.run_id == run_id).with_for_update()
        )
        if run_row is None:
            raise LookupError(f"Run not found: {run_id}")

        if (
            RunStatus(run_row.status)
            in {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}
            and event.get("type") not in _TERMINAL_EVENT_TYPES
        ):
            latest = await self._latest_event(run_id)
            if latest is not None:
                return _event_from_row(latest)
            return StreamEvent(
                run_id=run_id,
                sequence=run_row.last_sequence,
                event_type=str(event.get("type", "")),
                payload=dict(event),
            )

        sequence = run_row.last_sequence + 1
        assistant_row = await self._latest_assistant_message(run_id)
        assistant = (
            None if assistant_row is None else _message_from_row(assistant_row)
        )
        projection = reduce_run_event(_run_from_row(run_row), assistant, event)
        _apply_run_projection(run_row, assistant_row, projection, sequence)

        payload = {
            **event,
            "seq": sequence,
            "run_status": projection.run.status.value,
        }
        event_row = RunEventRow(
            run_id=run_id,
            sequence=sequence,
            event_type=str(event["type"]),
            payload=payload,
        )
        self._session.add(event_row)
        run_row.last_sequence = sequence
        await self._session.flush()
        return _event_from_row(event_row)

    async def list_events(
        self, run_id: UUID, after: int = 0
    ) -> list[StreamEvent]:
        rows = (
            await self._session.scalars(
                select(RunEventRow)
                .where(
                    RunEventRow.run_id == run_id,
                    RunEventRow.sequence > after,
                )
                .order_by(RunEventRow.sequence)
            )
        ).all()
        return [_event_from_row(row) for row in rows]

    async def list_events_for_owner(
        self, principal: Principal, run_id: UUID, after: int = 0
    ) -> list[StreamEvent]:
        rows = (
            await self._session.scalars(
                select(RunEventRow)
                .join(RunRow, RunRow.run_id == RunEventRow.run_id)
                .join(SessionRow, SessionRow.session_id == RunRow.session_id)
                .where(
                    RunEventRow.run_id == run_id,
                    RunEventRow.sequence > after,
                    SessionRow.owner_issuer == principal.issuer,
                    SessionRow.owner_subject == principal.subject,
                )
                .order_by(RunEventRow.sequence)
            )
        ).all()
        return [_event_from_row(row) for row in rows]


class SqlAlchemyMessageRepository:
    """Allocate message ordinals while the owning Session row is locked."""

    def __init__(self, db_session: AsyncSession) -> None:
        self._session = db_session

    async def append(self, message: Message) -> Message:
        row = MessageRow(
            session_id=message.session_id,
            ordinal=message.ordinal,
            run_id=message.run_id,
            role=message.role,
            content=message.content,
            metadata_=dict(message.metadata),
        )
        self._session.add(row)
        await self._session.flush()
        return _message_from_row(row)

    async def list_for_session(self, session_id: UUID) -> list[Message]:
        rows = (
            await self._session.scalars(
                select(MessageRow)
                .where(MessageRow.session_id == session_id)
                .order_by(MessageRow.ordinal)
            )
        ).all()
        return [_message_from_row(row) for row in rows]

    async def clear_for_session(self, session_id: UUID) -> None:
        await self._session.execute(
            delete(MessageRow).where(MessageRow.session_id == session_id)
        )

    async def append_pair(
        self, session: Session, run_id: UUID, prompt: str
    ) -> tuple[Message, Message]:
        session_row = await self._session.scalar(
            select(SessionRow)
            .where(SessionRow.session_id == session.id)
            .with_for_update()
        )
        if session_row is None:
            raise LookupError(f"Session not found: {session.id}")

        user_ordinal = session_row.next_message_ordinal
        assistant_ordinal = user_ordinal + 1
        user_row = MessageRow(
            session_id=session.id,
            ordinal=user_ordinal,
            run_id=run_id,
            role="user",
            content=prompt,
        )
        assistant_row = MessageRow(
            session_id=session.id,
            ordinal=assistant_ordinal,
            run_id=run_id,
            role="assistant",
            content="",
        )
        session_row.next_message_ordinal = assistant_ordinal + 1
        self._session.add_all([user_row, assistant_row])
        await self._session.flush()
        return _message_from_row(user_row), _message_from_row(assistant_row)
