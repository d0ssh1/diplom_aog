"""add user profile fields

Revision ID: b7c8d9e0f1g2
Revises: a1b2c3d4e5f6
Create Date: 2026-03-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1g2'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('full_name', sa.String(length=255), nullable=False, server_default=''))
    op.add_column('users', sa.Column('birth_date', sa.Date(), nullable=False, server_default='2000-01-01'))

    # Remove server defaults after adding columns (they were only for existing rows)
    op.alter_column('users', 'full_name', server_default=None)
    op.alter_column('users', 'birth_date', server_default=None)


def downgrade() -> None:
    op.drop_column('users', 'birth_date')
    op.drop_column('users', 'full_name')
