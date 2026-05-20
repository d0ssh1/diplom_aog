# Phase 4: Frontend — рестайл селекторов и минимапы

phase: 4
layer: components/FloorViewer
depends_on: phase-03
design: ../07-ui-spec.md

## Goal

Привести `BuildingFloorSectionSelector` и `FloorMinimap` к виду со скриншота: чёрные квадратные стрелки `< >`, активная оранжевая пилюля, неактивные белые с чёрной рамкой, минимапа без заголовка с чёрным stroke. Логика без изменений.

## Context

Стили после фазы 3 уже на правильной странице (чёрный хедер, sharp panel), но сами селекторы и минимапа выглядят по-старому. Спека — [07-ui-spec.md §3.3, §3.4](../07-ui-spec.md).

## Files to Modify

### `frontend/src/components/FloorViewer/BuildingFloorSectionSelector.module.css`

Полная переработка под §3.3:

1. **Лейбл секции** (`.label` или эквивалент): 12px/500, color `#888`, без uppercase/letter-spacing, margin-bottom 6px.
2. **Ряд кнопок** (`.row` или эквивалент): `display:flex; gap:0;` (стык-в-стык, как на скрине).
3. **Стрелки** `< >` (`.arrow` или эквивалент):
   - `width:36px; height:36px;`
   - `background:#0E0E0E; color:#FFFFFF; border:none; border-radius:0;`
   - cursor:pointer; hover `background:#222`
   - Disabled (в начале/конце): `opacity:0.35; cursor:not-allowed; pointer-events:none`
4. **Пилюля значения** (`.pill` или эквивалент):
   - `width:36px; height:36px; display:flex; align-items:center; justify-content:center;`
   - `font:14px/600 system-ui; border-radius:0;`
   - **inactive:** `background:#FFFFFF; color:#0E0E0E; border:1px solid #0E0E0E;` (важно: бордюр чёрный, как на скрине)
   - **active:** `background:#F97316; color:#FFFFFF; border:1px solid #F97316;`
   - hover inactive: `background:#F5F5F5`

**Важно про стык-в-стык:** при `border:1px` на каждой пилюле между ними получится двойная линия. Решение — использовать `box-shadow: inset 0 0 0 1px #0E0E0E` или применить border только сверху/снизу/влево/вправо с `margin-left:-1px` на соседних. Или, проще: weite селектор `.row > *:not(:first-child) { margin-left: -1px; }`. Выбор оставляем имплементатору; результат — одна линия между элементами.

### `frontend/src/components/FloorViewer/BuildingFloorSectionSelector.tsx`

Проверить, что:
- Лейблы в коде на русском без uppercase: «Корпус», «Отсек», «Этаж» (как сейчас).
- WINDOW_SIZE остаётся 3.
- Если в карусели <3 элементов, рендерится столько, сколько есть; стрелки disabled.

Логику и пропсы **не меняем**.

### `frontend/src/components/FloorViewer/FloorMinimap.module.css`

1. Контейнер `.minimap` (или эквивалент):
   - `background:#FFFFFF; border:1px solid #E5E5E5; border-radius:0; padding:12px; height:200px;`
2. SVG `.svg`: `width:100%; height:100%`.
3. `.sectionPolygon` (default): `fill:#FFFFFF; stroke:#0E0E0E; stroke-width:0.005;` (в SVG-юнитах [0,1]). Cursor pointer.
4. `.sectionActive`: `fill:#F97316; stroke:#F97316;`.
5. `.sectionHighlighted`: `fill:#FFFFFF; stroke:#F97316; stroke-width:0.008;`.
6. `.label` (текст с номером): `font:11px/600 system-ui; fill:#0E0E0E;` — для active fill переопределить через отдельный класс `.labelActive { fill:#FFFFFF }`.
7. Hover отсека: `opacity:0.85`.

### `frontend/src/components/FloorViewer/FloorMinimap.tsx`

Проверить, что текст подписи получает класс `.labelActive` когда `section.id === activeSectionId`. Если такого механизма нет — добавить (одна строка conditional className).

## Verification

- [ ] `/viewer` визуально: ряды селекторов `< S [D] B >` точно как на скрине — чёрные стрелки, активная оранжевая, неактивные белые с чёрной рамкой, без зазоров
- [ ] Минимапа: белый фон, чёрные контуры отсеков, активный отсек оранжевый с белой цифрой, отсек маршрута — белый с оранжевой обводкой
- [ ] Клики работают: переключение корпус/этаж/отсек меняет 3D-сцену; клик по отсеку в минимапе селектит его
- [ ] `tsc --noEmit` clean
- [ ] Регресс: `useFloorViewer` поведение не изменилось, цепочка selectBuilding → auto-pick floor/section работает
