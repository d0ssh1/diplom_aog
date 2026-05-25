# Testing Strategy: Room Labels 3D

## Правила

- Processing тесты: нет (фича чисто frontend)
- Frontend: утилитарные функции конвертации покрываются unit-тестами
- Three.js/R3F компоненты: визуальное тестирование в браузере (нет jest-r3f)

## Test Structure

```
frontend/src/
└── __tests__/
    └── roomDisplay.test.ts       ← unit-тесты утилит конвертации
```

## Coverage Mapping

### Утилитарные функции (roomDisplay.ts)

| Функция | Бизнес-правило | Тест |
|---------|---------------|------|
| `fromRoomAnnotation(r)` | center_x = r.x + r.width/2 | `test_fromRoomAnnotation_computes_center_from_bbox` |
| `fromRoomAnnotation(r)` | center_y = r.y + r.height/2 | (тот же тест) |
| `fromRoomAnnotation(r)` | использует r.center если задан | `test_fromRoomAnnotation_prefers_explicit_center` |
| `fromRoomAnnotation(r)` | вычисляет center из bbox если r.center=undefined | `test_fromRoomAnnotation_computes_center_from_bbox` |
| `fromRoomAnnotation(r)` | color из ROOM_COLORS по room_type (включая elevator) | `test_fromRoomAnnotation_assigns_color_by_room_type` |
| `fromRoomAnnotation(r)` | неизвестный room_type → '#c8c8c8' через fallback | `test_fromRoomAnnotation_unknown_type_fallback_color` |
| `fromVectorRoom(r)` | center_x = r.center.x | `test_fromVectorRoom_copies_center` |
| `fromVectorRoom(r)` | width из polygon bounding box | `test_fromVectorRoom_computes_width_from_polygon` |
| `fromVectorRoom(r)` | polygon.length=0 → width=0 | `test_fromVectorRoom_empty_polygon_returns_zero_size` |
| `normalizedToWorld(cx, cy, box, h)` | lerp x по box.x | `test_normalizedToWorld_x_lerp` |
| `normalizedToWorld(cx, cy, box, h)` | lerp z по box.z | `test_normalizedToWorld_z_lerp` |
| `normalizedToWorld(cx, cy, box, h)` | y = box.min.y + h*0.5 | `test_normalizedToWorld_y_mid_height` |

### Ручное тестирование (браузер)

| Сценарий | Проверить |
|----------|-----------|
| Wizard: нарисовать 3+ комнат, построить граф, построить 3D | Кнопка «Кабинеты» появляется |
| Включить тоггл | Все комнаты показаны как блоки + подписи |
| Вращение камеры | Метки следуют за 3D позициями |
| Выключить тоггл | Метки исчезают |
| EditPlanPage с сохранённой реконструкцией | Данные загружены из /vectors, кнопка работает |
| Реконструкция без rooms | Кнопка скрыта или неактивна |
| Unmount страницы (навигация назад) | Нет JS-ошибок в консоли, нет memory leaks |

## Test Count Summary

| Layer | Tests |
|-------|-------|
| utils (roomDisplay.ts) | 10 unit |
| Frontend visual | ручное |
| **TOTAL unit** | **10** |
