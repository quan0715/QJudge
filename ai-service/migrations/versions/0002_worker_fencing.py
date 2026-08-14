"""Add durable Worker execution fencing and repair state.

Revision ID: 0002_worker_fencing
Revises: 0001_ai_domain
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_worker_fencing"
down_revision: str | None = "0001_ai_domain"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SCHEMA = "ai"


def upgrade() -> None:
    op.add_column(
        "runs",
        sa.Column(
            "execution_epoch", sa.BigInteger(), nullable=False, server_default="0"
        ),
        schema=_SCHEMA,
    )
    op.add_column(
        "runs",
        sa.Column(
            "repair_pending",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema=_SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("runs", "repair_pending", schema=_SCHEMA)
    op.drop_column("runs", "execution_epoch", schema=_SCHEMA)
