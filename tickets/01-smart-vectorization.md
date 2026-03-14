# Тикет: smart-vectorization — Умный пайплайн векторизации

## Описание

Полная переработка пайплайна: от фотографии плана эвакуации до структурированной
векторной модели этажа со стенами, комнатами, дверями и номерами кабинетов.

Текущий пайплайн примитивен: Otsu + findContours → trimesh. Маска захватывает текст,
символы, легенду — всё подряд. Новый пайплайн должен очищать, классифицировать и
структурировать данные для всех последующих фич.

## Зависящие фичи (почему это критично)

Этот пайплайн создаёт фундамент для ВСЕХ визуальных фич:

| Фича | Что ей нужно от vectorization |
|------|-------------------------------|
| floor-editor | Room polygons с центрами, кликабельные комнаты, типы (corridor/room/staircase) |
| 3d-builder | Walls с толщиной, rooms как floor polygons, doors как проёмы |
| pathfinding-astar | Rooms + doors → граф, corridor waypoints каждые 2-3м, масштаб px→метры |
| building-assembly | Чистые контуры + реальные размеры для склейки секций, масштабный коэффициент |
| vector-editor | Walls/rooms как SVG-полигоны с точками для ручной правки |

Всё перечисленное учтено в дизайне VectorizationResult ниже.

---

## Что сейчас (AS IS)

```
Фото → Otsu → morphology → connectedComponents → сохранение маски PNG
→ ручное редактирование (fabric.js) → findContours(RETR_EXTERNAL)
→ Shapely → trimesh extrude → OBJ/GLB
```

Проблемы:
- Маска захватывает ВСЁ: текст, легенду, символы, зелёные стрелки, красную плашку, мини-план
- Зелёные линии маршрутов эвакуации → становятся "стенами" после бинаризации
- Красные символы (огнетушители, краны) → тоже "стены"
- Нет auto-crop: кадрирование только вручную
- Нет удаления текста
- Нет классификации контуров (всё = "стены")
- Нет room detection (нет понятия "комната")
- Нет door detection (нет понятия "дверь")
- Нет различения коридоров и комнат
- Нет толщины стен (нужна для 3D)
- Нет масштабного коэффициента px → метры
- ContourService ГОТОВ но не подключён
- BinarizationService ГОТОВ но не подключён
- pytesseract установлен но не используется

## Что должно стать (TO BE)

### Новый пайплайн (8 шагов)

```
Фото плана
  │
  ├─ [Ручной] Поворот 90° (кнопка уже есть)
  ├─ [Ручной] Подтверждение auto-crop (или ручной crop)
  │
  ▼
  [1] Brightness normalization
      CLAHE или гистограммная эквализация — выровнять контраст
      (фото с телефона может быть тёмным или пересвеченным)
  │
  ▼
  [2] Color filtering (ДО бинаризации!)
      HSV-маска: убрать всё с выраженным цветом (saturation > порог):
      - Зелёные стрелки эвакуации
      - Красные символы и плашки
      - Цветной текст инструкций
      Оставить только ахроматические пиксели (чёрно-серо-белые = стены)
      Метод: cv2.cvtColor(BGR→HSV), маска saturation < threshold, inpaint цветных зон
  │
  ▼
  [3] Auto-crop (предложение рамки)
      Найти область здания — крупнейший контур на грубой бинаризации:
      - Blur → threshold → findContours → filter by area (> 20% изображения)
      - approxPolyDP для выпрямления
      - Исключить мини-план в углу (он значительно меньше основного)
      - Предложить рамку пользователю (auto-suggest, не auto-apply)
      - Fallback: если не найдено → использовать всё изображение
  │
  ▼
  [4] Adaptive binarization
      Подключить BinarizationService:
      - Анализ гистограммы: bimodal → Otsu, иначе → adaptive threshold
      - MORPH_CLOSE для закрытия щелей в стенах (kernel=3, iterations=2)
      - connectedComponents: убрать мелкий шум (area < 50px)
  │
  ▼
  [5] Text detection + removal
      pytesseract для обнаружения текстовых регионов:
      - Распознать текст, сохранить блоки с координатами
      - Номера кабинетов: regex ^\d{3,4}[А-Яа-яA-Za-z]?$ (напр. "1103", "D314")
        или ^[A-ZА-Я]\d{3,4}$ — пометить отдельно
      - Номер БЕЗ буквы перед ним (чисто цифры "1103") — тоже валидный номер комнаты
      - Если номеров нет (планы 2, 3) — это нормально, поля остаются пустыми,
        админ заполнит в floor-editor
      - Inpaint все текстовые регионы из маски
  │
  ▼
  [6] Symbol removal
      Мелкие контуры (area < порог) после бинаризации:
      - Огнетушители, стрелки, краны — всё мелкое → убрать
      - НЕ трогать крупные контуры (стены, комнаты)
      - Порог: эмпирически подобрать на тестовых планах (~300-500px)
  │
  ▼
  [7] Room detection + classification (КЛЮЧЕВОЙ ШАГ)
      7a. Стены: контуры на очищенной маске (findContours RETR_TREE)
      7b. Толщина стен: distance transform на маске → медианная толщина
      7c. Комнаты: ИНВЕРТИРОВАТЬ маску (стены→0, пространства→255)
          → connected components на инвертированной маске
          → каждый компонент = потенциальная комната
          → фильтр: слишком маленькие (шум) и слишком большие (фон за зданием)
      7d. Классификация комнат:
          - Aspect ratio bounding box > 3:1 → corridor
          - Иначе → room
          - Лестницы/лифты: не пытаемся автодетектить, админ пометит в floor-editor
      7e. Двери: слегка расширить стены (dilate, kernel=5)
          → найти где расширение закрывает щели между двумя комнатами
          → эти точки = дверные проёмы
          → Door(position, connects=[room1_id, room2_id])
      7f. Привязка номеров кабинетов к комнатам:
          Для каждого TextBlock из шага 5 с паттерном номера:
          → найти комнату, в чей полигон попадает центр текста
          → присвоить room.name = text (если нет — оставить пустым)
  │
  ▼
  [8] Normalization + VectorizationResult
      - Все координаты нормализуются в [0, 1] относительно crop-области
      - Сохранить оригинальные размеры (для building-assembly)
      - Вычислить масштабный коэффициент (для pathfinding):
        pixels_per_meter можно оценить по толщине стен
        (стандартная стена здания ~0.2м, если толщина в px известна → масштаб)
      - Собрать VectorizationResult
```

---

## Доменные модели (расширение models/domain.py)

```python
class Point2D(BaseModel):
    """Точка в нормализованных координатах [0, 1]."""
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)

class Wall(BaseModel):
    """Стена как полилиния точек."""
    id: str
    points: List[Point2D]
    thickness: float = 0.2  # метры (вычислено из distance transform)

class Door(BaseModel):
    """Дверной проём между двумя комнатами."""
    id: str
    position: Point2D          # центр двери
    width: float               # ширина проёма (нормализованная)
    connects: List[str] = []   # id комнат, которые соединяет

class Room(BaseModel):
    """Помещение с полигоном и классификацией."""
    id: str
    name: str = ""             # "1103" из OCR или пустое (админ заполнит в floor-editor)
    polygon: List[Point2D]     # контур комнаты
    center: Point2D            # геометрический центр
    room_type: str = "room"    # room | corridor | staircase | elevator | exit | unknown
    area_normalized: float     # площадь в нормализованных единицах

class TextBlock(BaseModel):
    """Распознанный текстовый блок."""
    text: str
    center: Point2D
    is_room_number: bool = False  # True если матчит паттерн номера кабинета

class VectorizationResult(BaseModel):
    """Полный структурированный результат векторизации."""
    # Структурные элементы
    walls: List[Wall]
    rooms: List[Room] = []
    doors: List[Door] = []
    text_blocks: List[TextBlock] = []

    # Метаданные для downstream фич
    image_size_original: tuple[int, int]     # (w, h) до кропа — для building-assembly
    image_size_cropped: tuple[int, int]      # (w, h) после кропа
    crop_rect: Optional[dict] = None         # {x, y, w, h} нормализованный
    crop_applied: bool = False
    wall_thickness_px: float = 0.0           # медианная толщина стен в пикселях
    estimated_pixels_per_meter: float = 50.0 # оценка масштаба (для pathfinding)

    # Статистика
    rooms_with_names: int = 0    # сколько комнат получили номер из OCR
    corridors_count: int = 0     # сколько коридоров найдено
    doors_count: int = 0         # сколько дверей найдено
```

---

## Персистентность (для floor-editor и building-assembly)

VectorizationResult сохраняется в БД как JSON-поле в таблице Reconstruction:

```python
# Добавить в db/models/reconstruction.py:
class Reconstruction(Base):
    ...
    vectorization_data = Column(Text, nullable=True)  # JSON VectorizationResult
```

API endpoints для чтения/обновления:
- `GET /api/v1/reconstructions/{id}/vectors` → JSON VectorizationResult
- `PUT /api/v1/reconstructions/{id}/vectors` → обновить после правки в floor-editor

Это позволяет:
- floor-editor: загрузить rooms → админ отредактировал → сохранить обратно
- building-assembly: загрузить несколько VectorizationResult → совместить
- vector-editor: загрузить walls → отредактировать полигоны → сохранить

---

## UI на фронте (минимальные изменения)

На этапе "Маска стен":
- "Автоматический расчёт" → запускает новый пайплайн (шаги 1-8)
- После расчёта: overlay поверх плана — стены (белые контуры), комнаты (цветные
  полупрозрачные полигоны), номера кабинетов (текст если распознан)
- Ручной редактор (рисовать/стирать) остаётся как fallback
- Auto-crop: показать предложенную рамку, пользователь подтверждает или корректирует

Интерактивный редактор комнат (floor-editor) — отдельная фича, но vectorization
создаёт для него данные (rooms с полигонами и центрами).

---

## Acceptance Criteria

1. Color filtering убирает зелёные стрелки и красные символы ДО бинаризации
2. Auto-crop предлагает рамку вокруг здания (исключая легенду, инструкции, мини-план)
3. Adaptive binarization: Otsu для контрастных планов, adaptive для фото с телефона
4. Текст удалён из маски через inpaint
5. Номера кабинетов распознаны (если есть) и привязаны к комнатам
6. Если номеров нет — система работает, поля room.name пустые
7. Room detection через инверсию маски: комнаты выделены как замкнутые пространства
8. Коридоры отличены от комнат (aspect ratio > 3:1 → corridor)
9. Двери найдены (щели в стенах между соседними комнатами)
10. Толщина стен вычислена через distance transform
11. Масштабный коэффициент estimated_pixels_per_meter вычислен
12. Все координаты нормализованы в [0, 1]
13. VectorizationResult содержит walls + rooms + doors + text_blocks + метаданные
14. VectorizationResult сохраняется в БД (JSON) и доступен через API
15. mesh_builder принимает VectorizationResult (не сырые контуры)
16. Все 36 тестов из refactor-core проходят
17. Новые тесты >= 10:
    - color_filter (green removal, red removal)
    - auto_crop (finds building, excludes mini-plan)
    - binarization (otsu, adaptive)
    - room_detection (rectangle image → 1 room)
    - corridor_classification (long narrow → corridor)
    - door_detection (gap between rooms)
    - text_detection (number pattern matching)
    - normalization (all coords in [0,1])
    - empty_image (graceful handling)
    - full_pipeline (end-to-end on test image)
18. processing/ остаётся чистым (нет импортов из api/db/services)

## Обработка разных типов планов

Система должна работать с:
- Планы с номерами кабинетов (план 1: "1103", "1108") → OCR заполняет room.name
- Планы без номеров (планы 2, 3) → room.name пустое, админ заполнит позже
- Горизонтальные планы (план 1) → без поворота
- Вертикальные планы (план 2) → ручной поворот кнопкой
- Повёрнутые планы (план 3, 90°) → ручной поворот
- Планы с тонкими стенами (план 1) и жирными стенами (план 3) → adaptive binarization
- Фото с телефона (неравномерное освещение) → brightness normalization + adaptive threshold
- Сканы (равномерный контраст) → Otsu работает напрямую

## Чего НЕ делать

- НЕ реализовывать floor-editor UI (кликабельные комнаты — отдельная фича)
- НЕ реализовывать building-assembly (склейка — отдельная фича)
- НЕ реализовывать pathfinding (граф + A* — отдельная фича)
- НЕ детектить лестницы/лифты автоматически (админ пометит в floor-editor)
- НЕ обучать нейросети (геометрические методы OpenCV + ГОСТ-стандарт планов достаточны)
- НЕ менять существующие API endpoints (только добавить новые)

## Приоритет: ВЫСОКИЙ (блокирует 5 фич)