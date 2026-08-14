"""Create the AI Service domain schema.

Revision ID: 0001_ai_domain
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_ai_domain"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SCHEMA = "ai"
_EMPTY_JSON = sa.text("'{}'::jsonb")
_NOW = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.execute(sa.text(f'CREATE SCHEMA IF NOT EXISTS "{_SCHEMA}"'))

    op.create_table(
        "sessions",
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_issuer", sa.String(length=255), nullable=False),
        sa.Column("owner_subject", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column(
            "context",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_EMPTY_JSON,
        ),
        sa.Column(
            "next_message_ordinal", sa.Integer(), nullable=False, server_default="1"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=_NOW,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=_NOW,
        ),
        sa.PrimaryKeyConstraint("session_id", name="pk_sessions"),
        schema=_SCHEMA,
    )
    op.create_index(
        "ix_sessions_owner_updated_at",
        "sessions",
        ["owner_issuer", "owner_subject", sa.text("updated_at DESC")],
        schema=_SCHEMA,
    )

    op.create_table(
        "runs",
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("model_id", sa.String(length=50), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "pause_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_EMPTY_JSON,
        ),
        sa.Column(
            "cancel_requested", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("last_sequence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("input_tokens", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=_NOW,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=_NOW,
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["ai.sessions.session_id"],
            name="fk_runs_session_id_sessions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("run_id", name="pk_runs"),
        sa.UniqueConstraint(
            "session_id", "idempotency_key", name="uq_runs_session_idempotency"
        ),
        schema=_SCHEMA,
    )
    op.create_index(
        "uq_runs_active_session",
        "runs",
        ["session_id"],
        unique=True,
        schema=_SCHEMA,
        postgresql_where=sa.text(
            "status IN ('running', 'awaiting_approval', 'awaiting_user_answer')"
        ),
    )

    op.create_table(
        "messages",
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_EMPTY_JSON,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=_NOW,
        ),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["ai.runs.run_id"],
            name="fk_messages_run_id_runs",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["ai.sessions.session_id"],
            name="fk_messages_session_id_sessions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("session_id", "ordinal", name="pk_messages"),
        schema=_SCHEMA,
    )

    op.create_table(
        "run_events",
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=_NOW,
        ),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["ai.runs.run_id"],
            name="fk_run_events_run_id_runs",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("run_id", "sequence", name="pk_run_events"),
        schema=_SCHEMA,
    )

    op.create_table(
        "artifacts",
        sa.Column("artifact_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("produced_by_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("step", sa.String(length=64), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("checksum", sa.String(length=64), nullable=False, server_default=""),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_EMPTY_JSON,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=_NOW,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=_NOW,
        ),
        sa.ForeignKeyConstraint(
            ["produced_by_run_id"],
            ["ai.runs.run_id"],
            name="fk_artifacts_produced_by_run_id_runs",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["ai.sessions.session_id"],
            name="fk_artifacts_session_id_sessions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("artifact_id", name="pk_artifacts"),
        sa.UniqueConstraint(
            "session_id", "step", "filename", name="uq_artifacts_session_step_filename"
        ),
        schema=_SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("artifacts", schema=_SCHEMA)
    op.drop_table("run_events", schema=_SCHEMA)
    op.drop_table("messages", schema=_SCHEMA)
    op.drop_index("uq_runs_active_session", table_name="runs", schema=_SCHEMA)
    op.drop_table("runs", schema=_SCHEMA)
    op.drop_index("ix_sessions_owner_updated_at", table_name="sessions", schema=_SCHEMA)
    op.drop_table("sessions", schema=_SCHEMA)
    op.execute(sa.text(f'DROP SCHEMA IF EXISTS "{_SCHEMA}"'))
