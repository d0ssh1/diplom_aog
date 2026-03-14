# Phase 1: Domain Models

phase: 1
layer: models
depends_on: none
design: ../README.md

## Goal

Extend domain models in `models/domain.py` to support full VectorizationResult structure with Room, Door, TextBlock entities.

## Context

This is the first phase. No previous phases to depend on. Current `models/domain.py` has:
- `Point2D` — normalized coordinates [0, 1] (KEEP AS-IS)
- `Wall` — polyline with thickness (KEEP AS-IS)
- `FloorPlan` — basic structure (KEEP AS-IS)
- `VectorizationResult` — OLD VERSION with only 2 fields (REPLACE)

## Files to Create

None. Only modifying existing file.

## Files to Modify

### `backend/app/models/domain.py`

**What changes:** Replace old VectorizationResult, add Room, Door, TextBlock models.

**Lines affected:** Lines 26-30 (old VectorizationResult) → replace with extended version + new models.

**Implementation details:**

1. **Keep existing models unchanged:**
   - `Point2D` (lines 5-8) — already correct
   - `Wall` (lines 11-15) — already correct
   - `FloorPlan` (lines 18-23) — keep for backward compatibility

2. **Add new models BEFORE VectorizationResult:**

```python
class TextBlock(BaseModel):
    """Распознанный текстовый блок из OCR."""
    text: str
    center: Point2D
    is_room_number: bool = False  # True если матчит паттерн номера кабинета


class Door(BaseModel):
    """Дверной проём между двумя комнатами."""
    id: str  # UUID строка
    position: Point2D          # центр двери
    width: float               # ширина проёма (нормализованная [0,1])
    connects: List[str] = []   # id комнат, которые соединяет


class Room(BaseModel):
    """Помещение с полигоном и классификацией."""
    id: str  # UUID строка
    name: str = ""             # "1103" из OCR или пустое (админ заполнит в floor-editor)
    polygon: List[Point2D]     # контур комнаты
    center: Point2D            # геометрический центр
    room_type: str = "room"    # room | corridor | staircase | elevator | exit | unknown
    area_normalized: float     # площадь в нормализованных единицах [0,1]
```

3. **Replace VectorizationResult (lines 26-30):**

```python
class VectorizationResult(BaseModel):
    """Полный структурированный результат векторизации."""
    # Структурные элементы
    walls: List[Wall] = []
    rooms: List[Room] = []
    doors: List[Door] = []
    text_blocks: List[TextBlock] = []

    # Метаданные изображения
    image_size_original: Tuple[int, int]     # (width, height) до кропа
    image_size_cropped: Tuple[int, int]      # (width, height) после кропа
    crop_rect: Optional[dict] = None         # {x, y, width, height} нормализованный [0,1]
    crop_applied: bool = False
    rotation_angle: int = 0                  # 0/90/180/270 градусов

    # Масштаб и геометрия
    wall_thickness_px: float = 0.0           # медианная толщина стен в пикселях
    estimated_pixels_per_meter: float = 50.0 # оценка масштаба (для pathfinding)

    # Статистика
    rooms_with_names: int = 0    # сколько комнат получили номер из OCR
    corridors_count: int = 0     # сколько коридоров найдено
    doors_count: int = 0         # сколько дверей найдено
```

4. **Add imports at top of file:**

```python
from typing import List, Optional, Tuple
```

**Reference:**
- Design: `../01-architecture.md` (domain models section)
- Design: `../06-pipeline-spec.md` (Step 8, VectorizationResult structure)
- Ticket: `../../../../tickets/01-smart-vectorization.md` (lines 143-199, domain models)

**Business rules:**
- All coordinates must be in [0, 1] range (enforced by Point2D Field validation)
- room_type must be one of: room, corridor, staircase, elevator, exit, unknown
- rotation_angle must be 0, 90, 180, or 270
- Default values provided for all optional fields

**Validation:**
- Pydantic automatically validates Field constraints (ge=0.0, le=1.0 for Point2D)
- No additional validation needed

## Verification

- [ ] `python -m py_compile backend/app/models/domain.py` passes
- [ ] Import test: `python -c "from backend.app.models.domain import VectorizationResult, Room, Door, TextBlock; print('OK')"` succeeds
- [ ] Create test instance:
  ```python
  from backend.app.models.domain import VectorizationResult, Point2D, Wall, Room, Door, TextBlock

  result = VectorizationResult(
      walls=[Wall(id="w1", points=[Point2D(x=0.0, y=0.0), Point2D(x=1.0, y=0.0)], thickness=0.2)],
      rooms=[Room(id="r1", name="1103", polygon=[Point2D(x=0.1, y=0.1)], center=Point2D(x=0.5, y=0.5), area_normalized=0.25)],
      doors=[Door(id="d1", position=Point2D(x=0.5, y=0.0), width=0.05, connects=["r1", "r2"])],
      text_blocks=[TextBlock(text="1103", center=Point2D(x=0.5, y=0.5), is_room_number=True)],
      image_size_original=(2000, 1500),
      image_size_cropped=(1800, 1400),
      rotation_angle=90,
  )
  print(result.model_dump_json(indent=2))
  ```
- [ ] Validation test: coordinates out of range should fail:
  ```python
  # Should raise ValidationError
  try:
      Point2D(x=1.5, y=0.5)
      print("FAIL: should have raised ValidationError")
  except Exception as e:
      print(f"OK: {e}")
  ```
- [ ] All fields have correct types (check with `result.model_fields`)
- [ ] JSON serialization works: `result.model_dump_json()` produces valid JSON
- [ ] JSON deserialization works: `VectorizationResult.model_validate_json(json_str)` reconstructs object
