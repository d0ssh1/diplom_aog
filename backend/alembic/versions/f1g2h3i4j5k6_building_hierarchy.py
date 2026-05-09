"""building hierarchy: Building.code, Floor schema cols, sections table, Reconstruction.floor_id

Revision ID: f1g2h3i4j5k6
Revises: e0f1g2h3i4j5
Create Date: 2026-05-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1g2h3i4j5k6'
down_revision: Union[str, None] = 'e0f1g2h3i4j5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1-3. Drop FK-dependent table rows first (FK constraints prevent DROP TABLE)
    # Order: floor_transitions → rooms → reconstructions
    # -------------------------------------------------------------------------
    op.execute("DELETE FROM floor_transitions")
    op.execute("DELETE FROM rooms")
    op.execute("DELETE FROM reconstructions")

    # -------------------------------------------------------------------------
    # 4. Drop floors.reconstruction_id (legacy column)
    # -------------------------------------------------------------------------
    with op.batch_alter_table('floors') as batch_op:
        batch_op.drop_column('reconstruction_id')

    # -------------------------------------------------------------------------
    # 5-7. Add new Floor columns: schema_image_id, schema_crop_bbox, wall_polygons
    # Note: In SQLite batch mode, ForeignKey constraints on new columns are
    # expressed via create_foreign_key after the batch block, or accepted as
    # metadata-only (SQLite does not enforce FK by default).
    # We add them as plain columns; the FK is declared at ORM level.
    # -------------------------------------------------------------------------
    with op.batch_alter_table('floors') as batch_op:
        batch_op.add_column(
            sa.Column('schema_image_id', sa.String(length=36), nullable=True)
        )
        batch_op.add_column(
            sa.Column('schema_crop_bbox', sa.JSON(), nullable=True)
        )
        batch_op.add_column(
            sa.Column('wall_polygons', sa.JSON(), nullable=True)
        )

    # -------------------------------------------------------------------------
    # 8. Add Building.code — nullable first, populate, then NOT NULL + UNIQUE
    # -------------------------------------------------------------------------
    with op.batch_alter_table('buildings') as batch_op:
        batch_op.add_column(
            sa.Column('code', sa.String(length=5), nullable=True)
        )

    # Populate code from name for any existing buildings
    op.execute("UPDATE buildings SET code = UPPER(SUBSTR(name, 1, 1)) WHERE code IS NULL")

    with op.batch_alter_table('buildings') as batch_op:
        batch_op.alter_column('code', nullable=False)
        batch_op.create_unique_constraint('uq_buildings_code', ['code'])

    # -------------------------------------------------------------------------
    # 9. Reconstruct reconstructions: drop building_id + floor_number, add floor_id
    # -------------------------------------------------------------------------
    with op.batch_alter_table('reconstructions') as batch_op:
        batch_op.drop_column('building_id')
        batch_op.drop_column('floor_number')
        batch_op.add_column(
            sa.Column('floor_id', sa.Integer(), nullable=True)
        )

    # -------------------------------------------------------------------------
    # 10. Create sections table
    # -------------------------------------------------------------------------
    op.create_table(
        'sections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('floor_id', sa.Integer(), nullable=False),
        sa.Column('number', sa.Integer(), nullable=False),
        sa.Column('geometry', sa.JSON(), nullable=True),
        sa.Column('reconstruction_id', sa.Integer(), nullable=True),
        sa.Column('section_type', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['floor_id'], ['floors.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(
            ['reconstruction_id'], ['reconstructions.id'], ondelete='SET NULL'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('floor_id', 'number', name='uq_section_floor_number'),
        sa.UniqueConstraint('reconstruction_id', name='uq_section_reconstruction_id'),
    )
    op.create_index(op.f('ix_sections_id'), 'sections', ['id'], unique=False)


def downgrade() -> None:
    # -------------------------------------------------------------------------
    # Reverse in opposite order
    # -------------------------------------------------------------------------

    # Drop sections table
    op.drop_index(op.f('ix_sections_id'), table_name='sections')
    op.drop_table('sections')

    # Restore reconstructions: drop floor_id, re-add building_id + floor_number
    with op.batch_alter_table('reconstructions') as batch_op:
        batch_op.drop_column('floor_id')
        batch_op.add_column(
            sa.Column('building_id', sa.String(length=50), nullable=True)
        )
        batch_op.add_column(
            sa.Column('floor_number', sa.Integer(), nullable=True)
        )

    # Remove Building.code
    with op.batch_alter_table('buildings') as batch_op:
        batch_op.drop_constraint('uq_buildings_code', type_='unique')
        batch_op.drop_column('code')

    # Remove new Floor columns
    with op.batch_alter_table('floors') as batch_op:
        batch_op.drop_column('wall_polygons')
        batch_op.drop_column('schema_crop_bbox')
        batch_op.drop_column('schema_image_id')

    # Re-add floors.reconstruction_id
    with op.batch_alter_table('floors') as batch_op:
        batch_op.add_column(
            sa.Column('reconstruction_id', sa.Integer(), nullable=True)
        )
