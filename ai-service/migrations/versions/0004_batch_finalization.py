"""Persist the handoff from terminal batch runs to grading finalization."""
from alembic import op
import sqlalchemy as sa

revision = "0004_batch_finalization"
down_revision = "0003_canonical_model_ids"
branch_labels = None
depends_on = None


def upgrade():
    # Do not replay historical runs: their session artifacts may have changed.
    op.add_column("runs", sa.Column("finalization_pending", sa.Boolean(),
                  nullable=False, server_default=sa.false()), schema="ai")


def downgrade():
    op.drop_column("runs", "finalization_pending", schema="ai")
