# Тикет 17-impl: Улучшенный пайплайн бинаризации маски (CLAHE + Multi-pass + Directional morph)

**Приоритет:** Высокий  
**Тип:** Implement  
**На основе:** Research `mask-quality.md` + Design `docs/design/improved-mask-pipeline.md`

**Затрагиваемые файлы:**
- `backend/app/processing/pipeline.py` — 2 новые функции
- `backend/app/services/mask_service.py` — интеграция в `preview_mask` и `calculate_mask`
- `backend/tests/processing/test_pipeline.py` — тесты новых функций

**НЕ МЕНЯТЬ:**
- `apiService.ts`
- HSV диапазоны в `remove_green_elements` (sat_min=40)
- Pydantic-модели, endpoints, frontend

---

## Контекст

Research показал: CLAHE (`normalize_brightness`) уже реализован в `pipeline.py:41`, но отключён (`enable_normalize=False`). Бинаризация — один проход `adaptiveThreshold`. MORPH_CLOSE — квадратное ядро `(3,3)`.

Три изменения закрывают основные потери:
1. Включить CLAHE → выравнивает контраст, тонкие линии в тёмных зонах становятся видны
2. Multi-pass threshold (3 прохода с разными окнами, OR) → захватывает и тонкие, и толстые линии
3. Directional MORPH_CLOSE (H+V ядра) → закрывает разрывы без скругления углов

---

## Шаг 1: Новая функция `multi_pass_threshold` в `pipeline.py`

Добавить после `normalize_brightness()`:

```python
def multi_pass_threshold(
    gray: np.ndarray,
    passes: list[tuple[int, int, int]] | None = None,
) -> np.ndarray:
    """
    Несколько проходов adaptive threshold с разными параметрами,
    объединённых через bitwise_OR.

    Проход 1 — пользовательские параметры (толстые стены).
    Проход 2 — мелкое окно (тонкие линии, перегородки).
    Проход 3 — среднее окно (промежуточные элементы).

    Args:
        gray: grayscale (uint8)
        passes: list of (adaptiveMethod, blockSize, C).
                blockSize будет скорректирован до нечётного >= 3.
                Если None — default 3 прохода.
    Returns:
        Бинарная маска (uint8, 0 или 255)
    """
    t0 = time.perf_counter()

    if passes is None:
        passes = [
            (cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 15, 10),
            (cv2.ADAPTIVE_THRESH_MEAN_C, 7, 3),
            (cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 11, 5),
        ]

    result = np.zeros_like(gray)

    for method, block_size, c in passes:
        bs = max(3, block_size if block_size % 2 == 1 else block_size + 1)
        mask = cv2.adaptiveThreshold(
            gray, 255, method, cv2.THRESH_BINARY_INV, bs, c
        )
        result = cv2.bitwise_or(result, mask)

    logger.info("multi_pass_threshold: %d passes, %.1fms",
                len(passes), (time.perf_counter() - t0) * 1000)
    return result
```

---

## Шаг 2: Новая функция `directional_morph_close` в `pipeline.py`

Добавить после `multi_pass_threshold()`:

```python
def directional_morph_close(
    binary: np.ndarray,
    kernel_length: int = 3,
    iterations: int = 1,
) -> np.ndarray:
    """
    MORPH_CLOSE с линейными ядрами (H + V) вместо квадратного.
    Закрывает разрывы в линиях вдоль горизонтали и вертикали,
    не скругляя прямые углы стен.

    Args:
        binary: бинарная маска (uint8, 0/255)
        kernel_length: длина линейного ядра (default 3)
        iterations: количество итераций (default 1)
    Returns:
        Обработанная маска (uint8, 0/255)
    """
    t0 = time.perf_counter()

    kernel_h = np.ones((1, kernel_length), np.uint8)
    kernel_v = np.ones((kernel_length, 1), np.uint8)

    closed_h = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_h, iterations=iterations)
    closed_v = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_v, iterations=iterations)

    result = cv2.bitwise_or(closed_h, closed_v)

    logger.info("directional_morph_close: kernel=%d, %.1fms",
                kernel_length, (time.perf_counter() - t0) * 1000)
    return result
```

---

## Шаг 3: Интеграция в `mask_service.py` — `preview_mask`

Найти в `preview_mask` текущую бинаризацию (GaussianBlur → adaptiveThreshold → MORPH_CLOSE) и заменить:

**Было (примерно):**
```python
gray = BinarizationService.to_grayscale(image)
blurred = cv2.GaussianBlur(gray, (3, 3), 0)
binary = cv2.adaptiveThreshold(
    blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv2.THRESH_BINARY_INV, block_size, threshold_c
)
kernel = np.ones((3, 3), np.uint8)
binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
```

**Стало:**
```python
from app.processing.pipeline import normalize_brightness, multi_pass_threshold, directional_morph_close

# 1. CLAHE (включаем — был отключён)
image = normalize_brightness(image, clip_limit=2.0, tile_size=8)

# 2. Grayscale + blur (без изменений)
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
blurred = cv2.GaussianBlur(gray, (3, 3), 0)

# 3. Multi-pass threshold (вместо одного прохода)
passes = [
    (cv2.ADAPTIVE_THRESH_GAUSSIAN_C, block_size, threshold_c),  # Параметры пользователя
    (cv2.ADAPTIVE_THRESH_MEAN_C, 7, 3),                        # Тонкие линии
    (cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 11, 5),                    # Средние элементы
]
binary = multi_pass_threshold(blurred, passes=passes)

# 4. Шумоподавление (удаляет одиночные пиксели от прохода 2)
kernel_noise = np.ones((2, 2), np.uint8)
binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel_noise, iterations=1)

# 5. Directional morph close (вместо квадратного MORPH_CLOSE)
binary = directional_morph_close(binary, kernel_length=3, iterations=1)
```

---

## Шаг 4: Интеграция в `mask_service.py` — `calculate_mask`

Та же замена что и для `preview_mask`. Дополнительно:

1. Изменить default `enable_normalize` с `False` на `True`:
```python
async def calculate_mask(
    self, file_id, crop, rotation,
    block_size=15, threshold_c=10,
    enable_normalize=True,  # ← Было False
    ...
):
```

2. В теле функции: если `enable_normalize` уже есть if-блок — убедиться что он вызывает `normalize_brightness()`.

3. Заменить бинаризацию и морфологию на `multi_pass_threshold` + `directional_morph_close` (аналогично preview_mask).

---

## Шаг 5: Тесты в `test_pipeline.py`

```python
import numpy as np
import cv2
from app.processing.pipeline import multi_pass_threshold, directional_morph_close


class TestMultiPassThreshold:
    def test_captures_thin_line(self):
        """Линия толщиной 1px должна быть захвачена."""
        img = np.ones((100, 100), dtype=np.uint8) * 200
        img[50, 20:80] = 30
        result = multi_pass_threshold(img)
        captured = np.sum(result[50, 20:80] == 255)
        assert captured > 50, f"Captured only {captured}/60 pixels of thin line"

    def test_captures_thick_wall(self):
        """Стена толщиной 5px должна быть захвачена."""
        img = np.ones((100, 100), dtype=np.uint8) * 200
        img[40:45, 20:80] = 30
        result = multi_pass_threshold(img)
        captured = np.sum(result[42, 20:80] == 255)
        assert captured > 50

    def test_custom_passes(self):
        """Пользовательские параметры проходов работают."""
        img = np.ones((100, 100), dtype=np.uint8) * 200
        img[50, 20:80] = 30
        passes = [(cv2.ADAPTIVE_THRESH_MEAN_C, 5, 2)]
        result = multi_pass_threshold(img, passes=passes)
        assert result.shape == img.shape

    def test_even_blocksize_corrected(self):
        """Чётный blockSize корректируется до нечётного."""
        img = np.ones((50, 50), dtype=np.uint8) * 128
        # blockSize=10 → должен стать 11, не падать
        passes = [(cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 10, 5)]
        result = multi_pass_threshold(img, passes=passes)
        assert result.shape == img.shape


class TestDirectionalMorphClose:
    def test_preserves_right_angle(self):
        """Прямой угол не скругляется."""
        img = np.zeros((100, 100), dtype=np.uint8)
        img[20:22, 20:60] = 255  # Горизонтальная стена
        img[20:60, 20:22] = 255  # Вертикальная стена
        result = directional_morph_close(img)
        assert result[20, 20] == 255, "Corner pixel lost"
        assert result[18, 18] == 0, "Corner rounded (diagonal pixel shouldn't be white)"

    def test_closes_horizontal_gap(self):
        """Закрывает разрыв в горизонтальной линии."""
        img = np.zeros((50, 100), dtype=np.uint8)
        img[25, 20:48] = 255
        img[25, 52:80] = 255  # Разрыв 4px
        result = directional_morph_close(img, kernel_length=5)
        assert result[25, 50] == 255, "Gap not closed"

    def test_closes_vertical_gap(self):
        """Закрывает разрыв в вертикальной линии."""
        img = np.zeros((100, 50), dtype=np.uint8)
        img[20:48, 25] = 255
        img[52:80, 25] = 255  # Разрыв 4px
        result = directional_morph_close(img, kernel_length=5)
        assert result[50, 25] == 255, "Gap not closed"
```

---

## Шаг 6: Визуальное тестирование

После реализации — вручную протестировать на реальных планах:

1. Загрузить 2–3 плана эвакуации
2. Сравнить маску ДО и ПОСЛЕ на том же blockSize/thresholdC
3. Проверить:
   - Тонкие перегородки видны?
   - Углы прямые?
   - Фон чистый (нет зернистости)?
   - Ползунки ещё работают осмысленно?

---

## Чеклист после реализации

- [ ] `multi_pass_threshold()` добавлена в `pipeline.py`
- [ ] `directional_morph_close()` добавлена в `pipeline.py`
- [ ] CLAHE включён в `preview_mask` (вызов `normalize_brightness`)
- [ ] CLAHE включён в `calculate_mask` (default `enable_normalize=True`)
- [ ] Multi-pass threshold заменил одиночный `adaptiveThreshold` в обоих методах
- [ ] Directional morph close заменил `MORPH_CLOSE(3,3)` в обоих методах
- [ ] Шумоподавление `MORPH_OPEN(2,2)` добавлено после multi-pass
- [ ] Ползунки Чувствительность/Контраст управляют проходом 1 — работают
- [ ] Unit-тесты для `multi_pass_threshold` — pass
- [ ] Unit-тесты для `directional_morph_close` — pass
- [ ] Визуальное тестирование: тонкие линии захватываются
- [ ] Визуальное тестирование: углы не скруглены
- [ ] Визуальное тестирование: фон чистый
- [ ] `pytest` — pass
- [ ] Время mask-preview < 2 секунд