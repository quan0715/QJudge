"""Canonicalize persisted DeepSeek model IDs.

Revision ID: 0003_canonical_model_ids
Revises: 0002_worker_fencing
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_canonical_model_ids"
down_revision: str | None = "0002_worker_fencing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE ai.runs
            SET model_id = 'deepseek-v4-flash'
            WHERE model_id IN ('deepseek-v4', 'deepseek-v4-thinking')
            """
        )
    )


def downgrade() -> None:
    # Canonical IDs cannot be losslessly mapped back to the two legacy IDs.
    pass
