# Тикет 18: Фикс маски — простой порог яркости вместо multi-pass adaptive threshold

**Приоритет:** Критический (маска непригодна после тикета 17)  
**Предыдущий тикет:** 17-impl (создал шум, не решил проблему)

**Затрагиваемые файлы:**
- `backend/app/services/mask_service.py`
- `backend/app/processing/pipeline.py` (опционально — новая функция)

---

## Проблема

Тикет 17-impl добавил multi-pass adaptive threshold, что засыпало маску белым шумом (текстура бумаги), но тонкие чёрные линии всё равно не захватываются.

**Корневая ошибка подхода:** adaptive threshold анализирует **локальный контраст** — сравнивает каждый пиксель со средним в окне. Тонкая чёрная линия (яркость ~40) рядом с тёмной областью (яркость ~80) может оказаться «недостаточно контрастной» и быть пропущена. При этом зернистость бумаги (разница в 10–15 единиц яркости) в светлых зонах — наоборот, захватывается как «контрастная».

**Правильный подход:** после CLAHE (который уже выровнял освещение) — просто найти все пиксели **темнее порога**. Чёрная линия = пиксель с яркостью < 100. Это не зависит от соседей.

---

## Решение

Заменить multi-pass adaptive threshold на **комбинацию глобального порога + одного прохода adaptive threshold**:

```
CLAHE → grayscale → GaussianBlur
→ Глобальный порог (захватывает ВСЁ чёрное)
→ OR с одним adaptive threshold (подчищает полутона)
→ Шумоподавление MORPH_OPEN(2,2)
→ Directional morph close
```

### Новый пайплайн в `preview_mask` и `calculate_mask`:

```python
# 1. CLAHE (из тикета 17 — оставляем, работает)
image = normalize_brightness(image, clip_limit=2.0, tile_size=8)

# 2. Grayscale + blur
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
blurred = cv2.GaussianBlur(gray, (3, 3), 0)

# 3. НОВОЕ: Глобальный порог яркости
# Всё что темнее threshold_value — стена.
# threshold_value вычисляется из пользовательских параметров.
# block_size (Чувствительность) → управляет глобальным порогом (чем выше — тем больше захватывает)
# threshold_c (Контраст) → управляет adaptive threshold (оставляем для полутонов)
#
# Маппинг block_size (7–51) → threshold_value (80–160):
# block_size=7 (мин) → threshold=80 (захватывает только очень чёрное)
# block_size=15 (default) → threshold=110 (баланс)
# block_size=51 (макс) → threshold=160 (захватывает полутёмное)
threshold_value = int(80 + (block_size - 7) * (160 - 80) / (51 - 7))
_, global_mask = cv2.threshold(blurred, threshold_value, 255, cv2.THRESH_BINARY_INV)

# 4. Один проход adaptive threshold (для полутонов и переходных зон)
bs = max(3, block_size if block_size % 2 == 1 else block_size + 1)
adaptive_mask = cv2.adaptiveThreshold(
    blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv2.THRESH_BINARY_INV, bs, threshold_c
)

# 5. Объединение: всё чёрное ИЛИ локально контрастное
binary = cv2.bitwise_or(global_mask, adaptive_mask)

# 6. Шумоподавление (из тикета 17 — оставляем)
kernel_noise = np.ones((2, 2), np.uint8)
binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel_noise, iterations=1)

# 7. Directional morph close (из тикета 17 — оставляем)
binary = directional_morph_close(binary, kernel_length=3, iterations=1)
```

### Почему это сработает:

| Элемент | Яркость пикселя | Глобальный порог (110) | Adaptive threshold |
|---------|-----------------|----------------------|-------------------|
| Толстая стена | ~30–50 | ✅ захвачена | ✅ захвачена |
| Тонкая перегородка | ~40–70 | ✅ захвачена | ❌ может пропустить |
| Дверной проём | ~50–80 | ✅ захвачена | ❌ может пропустить |
| Фон бумаги | ~180–220 | ❌ не захвачен | ❌ не захвачен |
| Текстура бумаги | ~170–190 | ❌ не захвачен | ⚠️ может захватить |
| Полутень на фото | ~120–150 | ⚠️ зависит от порога | ✅ adaptive справится |

Глобальный порог ловит всё чёрное. Adaptive threshold ловит полутона, которые могут быть стенами. `OR` объединяет. Шумоподавление убирает мелкие артефакты.

---

## Что удалить из тикета 17

Удалить вызов `multi_pass_threshold()` из `preview_mask` и `calculate_mask`. Саму функцию в `pipeline.py` можно оставить (не мешает), но она больше не используется.

**Оставить из тикета 17:**
- CLAHE (`normalize_brightness`) — ✅ работает, нужен
- `directional_morph_close()` — ✅ работает, нужен  
- Шумоподавление `MORPH_OPEN(2,2)` — ✅ работает, нужен

**Заменить:**
- `multi_pass_threshold()` → глобальный порог + один adaptive threshold + OR

---

## Маппинг ползунков UI

Ползунки не меняются (без изменений на фронте), но их **смысл** чуть корректируется:

| Ползунок | Параметр | Раньше | Теперь |
|----------|----------|--------|--------|
| Чувствительность | `block_size` (7–51) | blockSize adaptive threshold | Глобальный порог яркости (80–160) + blockSize adaptive |
| Контраст | `threshold_c` (2–20) | C adaptive threshold | C adaptive threshold (без изменений) |

При `block_size=15` (default): `threshold_value = 110` — захватывает всё с яркостью < 110 (все чёрные линии) + adaptive threshold подчищает полутона.

При увеличении Чувствительности (block_size→51): `threshold_value → 160` — захватывает больше (включая серые элементы).

При уменьшении (block_size→7): `threshold_value → 80` — захватывает только самое чёрное.

---

## Чеклист

- [ ] Заменить `multi_pass_threshold()` на глобальный порог + один adaptive + OR
- [ ] Ползунок Чувствительность управляет глобальным порогом (маппинг 7–51 → 80–160)
- [ ] Ползунок Контраст управляет adaptive threshold (без изменений)
- [ ] CLAHE, directional morph close, шумоподавление — оставлены из тикета 17
- [ ] Визуально: тонкие линии захвачены
- [ ] Визуально: фон чистый (нет зернистости)
- [ ] Визуально: при default параметрах (15, 10) — результат лучше чем до тикета 17
- [ ] `pytest` — pass