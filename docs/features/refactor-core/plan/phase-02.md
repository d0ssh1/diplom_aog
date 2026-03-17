# Phase 02: Processing Pure Functions

phase: 2
layer: processing
depends_on: phase-01
design: ../01-architecture.md, ../02-behavior.md

## Goal

Создать три новых файла с чистыми функциями и рефакторировать `navigation.py`.
Алгоритмы НЕ переписываются — код извлекается из существующих классов.
Старые файлы (`mask_service.py`, `reconstruction_service.py`, `mesh_generator.py`)
остаются нетронутыми до Phase 05.

## Context

Phase 01 создала:
- `app.core.exceptions.ImageProcessingError` — поднимается на ошибках обработки

## Декомпозиция алгоритмов

Что откуда извлекается:

| Новый файл | Источник | Что берём |
|------------|----------|-----------|
| `preprocessor.py` | `mask_service.py:36-113` | `calculate_mask()` без file I/O (только OpenCV-пайплайн) |
| `vectorizer.py` | `mesh_generator.py:376-388` | `cv2.findContours` + area filter из `process_plan_image()` |
| `mesh_builder.py` | `mesh_generator.py:227-306` | `generate_floor_model()` без `print()` → возвращает `trimesh.Trimesh` |
| `navigation.py` | `navigation.py:37+` | Добавить top-level `a_star()` рядом с классом (не удалять класс) |

## Files to Create

### `backend/app/processing/preprocessor.py`

**Purpose:** Чистая функция бинаризации изображения. Вход: BGR ndarray. Выход: бинарный ndarray.

**Implementation details:**

```python
import logging
import cv2
import numpy as np
from app.core.exceptions import ImageProcessingError

logger = logging.getLogger(__name__)

def preprocess_image(
    image: np.ndarray,
    crop: dict | None = None,
    rotation: int = 0,
) -> np.ndarray:
    """
    Preprocessing: rotate → crop → grayscale → GaussianBlur → Otsu → morphology → noise removal.

    Args:
        image: BGR изображение (H, W, 3), dtype=uint8. НЕ мутируется.
        crop: dict с ключами x, y, width, height (0-1 нормализованные). None = не кропать.
        rotation: поворот в градусах (0, 90, 180, 270).

    Returns:
        Бинарная маска (H, W), dtype=uint8, значения 0 или 255. Стены = 255, фон = 0.

    Raises:
        ImageProcessingError: если входное изображение пустое или имеет неверный формат.
    """
```

- Логика копируется из `mask_service.py:36-113` — rotate, crop, grayscale, GaussianBlur(5,5),
  `cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU`, `MORPH_CLOSE(3,3,iter=2)`, `connectedComponentsWithStats`
- `image.copy()` в начале — входной ndarray НЕ мутируется (правило `prompts/python_style.md`)
- `print()` заменить на `logger.debug()`
- Ошибки: пустой ndarray (`image.size == 0`) → `ImageProcessingError("preprocess_image", "Empty image")`
- НЕТ импортов из `app.api`, `app.db`, `app.core.config`, `app.services`

---

### `backend/app/processing/vectorizer.py`

**Purpose:** Чистая функция нахождения контуров стен на бинарной маске.

**Implementation details:**

```python
import cv2
import numpy as np
from typing import List
from app.core.exceptions import ImageProcessingError

MIN_CONTOUR_AREA = 50  # пикселей — фильтр мелкого шума

def find_contours(
    mask: np.ndarray,
    min_area: int = MIN_CONTOUR_AREA,
) -> List[np.ndarray]:
    """
    Находит контуры стен на бинарной маске.

    Args:
        mask: Бинарная маска (H, W), dtype=uint8, значения 0/255. НЕ мутируется.
        min_area: Минимальная площадь контура в пикселях (фильтр шума).

    Returns:
        Список контуров как ndarray формата (N, 1, 2). Может быть пустым.

    Raises:
        ImageProcessingError: если mask пустая или неверного dtype.
    """
```

- Логика из `mesh_generator.py:376-388` (`process_plan_image`):
  `cv2.findContours(mask.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)`
  + фильтр по `cv2.contourArea(c) > min_area`
- Возвращает пустой `[]` если контуров нет (не исключение — валидный результат)
- `ImageProcessingError` только при пустой/неверной маске

---

### `backend/app/processing/mesh_builder.py`

**Purpose:** Чистая функция построения 3D-меша из контуров. Возвращает `trimesh.Trimesh`.
Файлы НЕ сохраняет — это делает `services/reconstruction_service.py`.

**Implementation details:**

```python
import logging
import numpy as np
from typing import List, Optional
from app.core.exceptions import ImageProcessingError

logger = logging.getLogger(__name__)

def build_mesh(
    contours: List[np.ndarray],
    image_width: int,
    image_height: int,
    floor_height: float = 1.5,
    pixels_per_meter: float = 50.0,
) -> "trimesh.Trimesh":
    """
    Строит 3D-меш этажа из контуров стен.

    Args:
        contours: Список OpenCV контуров (List[ndarray shape (N,1,2)]).
        image_width: Ширина исходного изображения в пикселях.
        image_height: Высота исходного изображения в пикселях.
        floor_height: Высота этажа в метрах.
        pixels_per_meter: Масштаб.

    Returns:
        trimesh.Trimesh — объединённый меш (стены + пол). НЕ сохранён на диск.

    Raises:
        ImageProcessingError: если контуры пустые или trimesh не установлен.
    """
```

- Логика из `mesh_generator.py:227-306` (`generate_floor_model`):
  `contours_to_polygons()` → `create_extruded_wall()` → `trimesh.util.concatenate()` → rotate
- Делегирует вычисления в `MeshGeneratorService` через внутренний вызов без `output_dir`:
  ```python
  from app.processing.mesh_generator import MeshGeneratorService
  _gen = MeshGeneratorService(output_dir="/tmp", floor_height=floor_height, pixels_per_meter=pixels_per_meter)
  return _gen.generate_floor_model(contours, image_width, image_height)
  ```
  Это позволяет не дублировать алгоритм. `output_dir="/tmp"` передан но не используется
  (export не вызывается).
- `print()` внутри `MeshGeneratorService` — заменяем на `logger.debug()` в Phase 05 при
  рефакторинге самого класса (low priority, не критично для этой фазы).
- `ImageProcessingError("build_mesh", "No contours provided")` если `len(contours) == 0`
- `ImageProcessingError("build_mesh", "trimesh not installed")` если `trimesh is None`

---

## Files to Modify

### `backend/app/processing/navigation.py`

**What changes:** Добавить top-level функцию `a_star()` рядом с классом `NavigationGraphService`.
Класс НЕ удаляется — он нужен для совместимости.

**Lines affected:** Добавить в конец файла (~40 строк)

```python
def a_star(
    graph: dict,  # {node_id: {"neighbors": [(node_id, weight)], "pos": (x, y)}}
    start_id: int,
    end_id: int,
) -> Optional[List[int]]:
    """
    A* поиск пути между двумя узлами графа.

    Args:
        graph: Граф навигации как dict. node_id → {"neighbors": [(id, weight)], "pos": (x, y)}.
        start_id: ID стартового узла.
        end_id: ID конечного узла.

    Returns:
        Список node_id от start до end включительно, или None если пути нет.
    """
```

- Эвристика: Euclidean distance между позициями узлов (`math.hypot`)
- Использует `heapq` (уже импортирован в файле)
- НЕТ импортов из `app.api`, `app.db`, `app.core.config`

## Verification

- [ ] `python -m py_compile backend/app/processing/preprocessor.py`
- [ ] `python -m py_compile backend/app/processing/vectorizer.py`
- [ ] `python -m py_compile backend/app/processing/mesh_builder.py`
- [ ] `python -m py_compile backend/app/processing/navigation.py`
- [ ] `grep -rn "from app\.api\|from app\.db\|from app\.core\.config\|from app\.services" backend/app/processing/preprocessor.py backend/app/processing/vectorizer.py backend/app/processing/mesh_builder.py backend/app/processing/navigation.py` → пусто
- [ ] `python -c "from app.processing.preprocessor import preprocess_image; print('OK')"` из `backend/`
- [ ] `python -c "from app.processing.vectorizer import find_contours; print('OK')"` из `backend/`
- [ ] `python -c "from app.processing.mesh_builder import build_mesh; print('OK')"` из `backend/`
- [ ] Существующий pipeline (`api/reconstruction.py`) НЕ сломан (новые файлы никем не импортируются ещё)
