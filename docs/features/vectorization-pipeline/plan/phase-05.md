# Phase 5: Database Migration

phase: 5
layer: db
depends_on: phase-01
design: ../README.md

## Goal

Add `vectorization_data` column to `reconstructions` table for storing VectorizationResult as JSON.

## Context

Phase 1 completed: VectorizationResult model defined.

## Files to Create

### Migration file

Create: `backend/alembic/versions/{timestamp}_add_vectorization_data.py`

```python
"""add vectorization_data column

Revision ID: {generated}
Revises: {previous_revision}
Create Date: 2026-03-14
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '{generated}'
down_revision = '{previous_revision}'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reconstructions', sa.Column('vectorization_data', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('reconstructions', 'vectorization_data')
```

## Files to Modify

### `backend/app/db/models/reconstruction.py`

**Add column after line 52:**

```python
vectorization_data = Column(Text, nullable=True)  # JSON VectorizationResult
```

### `backend/app/db/repositories/reconstruction_repo.py`

**Add method:**

```python
async def update_vectorization_data(
    self,
    reconstruction_id: int,
    vectorization_json: str
) -> Optional[Reconstruction]:
    """Update vectorization_data field."""
    stmt = (
        update(Reconstruction)
        .where(Reconstruction.id == reconstruction_id)
        .values(vectorization_data=vectorization_json, updated_at=func.now())
        .returning(Reconstruction)
    )
    result = await self._session.execute(stmt)
    await self._session.commit()
    return result.scalar_one_or_none()
```

## Verification

- [ ] Generate migration: `alembic revision --autogenerate -m "add vectorization_data"`
- [ ] Run migration: `alembic upgrade head`
- [ ] Check DB schema: column exists, type=Text, nullable=True
- [ ] Rollback test: `alembic downgrade -1` removes column
- [ ] Re-apply: `alembic upgrade head`
- [ ] Test repository method with mock data
