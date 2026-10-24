"""Batch grading writes through tools; the terminal finalization handoff is gone."""
from alembic import op
import sqlalchemy as sa

revision = "0005_drop_batch_finalization"
down_revision = "0004_batch_finalization"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("runs", "finalization_pending", schema="ai")


def downgrade():
    op.add_column("runs", sa.Column("finalization_pending", sa.Boolean(),
                  nullable=False, server_default=sa.false()), schema="ai")
