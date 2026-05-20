# Phase 3: Frontend — тема + layout страницы

phase: 3
layer: css + page tsx
depends_on: phase-02
design: ../07-ui-spec.md

## Goal

Переписать визуальные основы `FloorViewerPage` под скриншот-макет: чёрный хедер, белый viewport, ширина левой панели 280px, sharp corners, новые токены. Логику не трогаем.

## Context

Текущий [FloorViewerPage.module.css](frontend/src/pages/FloorViewerPage.module.css) — белый хедер `#fff`, серый фон `#eceff1`, ширина 260px, `border-radius:4px`. Спека требует чёрный хедер `#0E0E0E`, белый viewport, 280px, radius 0. См. [07-ui-spec.md §2-§4](../07-ui-spec.md).

## Files to Modify

### `frontend/src/pages/FloorViewerPage.module.css`

**Что меняем (полная переработка стилей, логика страницы без изменений):**

1. `.page` — `background: #FFFFFF` (вместо `#eceff1`).
2. `.header`:
   - `background: #0E0E0E`
   - `height: 56px`, `padding: 0 24px`
   - убрать `border-bottom`
   - flex row, gap:12px, align-items:center
3. `.backBtn` — `color: #FFFFFF`, font-size 16px; hover background `rgba(255,255,255,0.08)` (не цвет text).
4. `.headerSeparator` — `color: #6B6B6B`, 14px.
5. `.headerTitle` — `color: #FFFFFF`, 15px/600.
6. `.leftPanel` — `width: 280px`, остальное (`background:#fff`, padding:16, gap:16) сохранить.
7. `.routeTitle` — убрать `text-transform: uppercase`, `letter-spacing`. font 12px/500, color `#888`. (Применимо ко всем `.routeTitle`, `.minimapTitle`, селекторным лейблам — если общий класс, проще; если разные — править все.)
8. `.routeInput` — `border-radius: 0`, `border: 1px solid #E5E5E5`, height 36px (через padding или явная высота), `:focus border-color: #F97316`.
9. `.routeBtn` — `border-radius: 0`, height 40px, остальное (`#F97316`, white, 13/600) сохранить. Hover `#EA6C0A` оставить.
10. `.divider` — удалить класс или скрыть (визуально дивайдеров между секциями не нужно — отступы 16px в gap уже достаточны).
11. `.minimapTitle` — **удалить класс** + удалить его рендер из tsx (см. ниже).
12. `.zoomControls` — переписать под §3.5: `position:absolute; right:16px; top:50%; transform:translateY(-50%); flex-direction:column; gap:4px;`. Убрать `bottom`.
13. `.zoomBtn` — `width:40px; height:40px; background:#0E0E0E; color:#FFFFFF; border:none; border-radius:0; box-shadow: 0 1px 3px rgba(0,0,0,0.12)`. Hover `#222`. **Но**: новый компонент `ZoomControls` в Phase 5 принесёт свои стили — здесь достаточно временно стилизовать существующие inline-кнопки, чтобы страница уже выглядела корректно в этой фазе.

### `frontend/src/pages/FloorViewerPage.tsx`

**Что меняем:**

1. Удалить рендер `<div className={styles.minimapTitle}>Отсеки</div>` (или эквивалент) — заголовок секции минимапы не нужен.
2. Удалить рендер `<div className={styles.divider} />` между секциями, если он там есть.
3. Header DOM: убедиться, что `← {ДВФУ?}` рендерит шеврон-разделитель `›` между «ДВФУ» и «Корпус {code}». Если в текущей разметке стоит просто текст «>», заменить на `›` (U+203A) или SVG-иконку chevron, и обернуть в `<span className={styles.headerSeparator}>›</span>`.
4. Логику страницы (selectors, callbacks, useFloorViewer wiring) **не трогаем**.

### `frontend/src/components/MeshViewer/MeshViewer.tsx`

**Что меняем (минимально):**

1. Цвет сцены: текущий fallback `#ECEFF1` → `#FFFFFF`. Найти строку с заданием `scene.background` или CSS-фоном `<Canvas style={{ background: '#FFF' }}>`.
2. Floor plane `#F5F0E8` → `#FFFFFF` (или убрать рендер `FloorPlane`, если визуально не нужен). Скрин показывает однородный белый, без подложки.

## Verification

- [ ] `npm run dev` + `/viewer` — хедер чёрный, viewport белый, панель 280px, все углы прямые
- [ ] Кнопки селектора и минимапа пока могут выглядеть «старо» — это нормально, фаза 4 их переоденет
- [ ] Zoom-кнопки переехали в центр справа по вертикали и теперь чёрные
- [ ] `tsc --noEmit` clean
- [ ] Регресс: `/admin/buildings`, `/admin/floor-editor` — визуально без изменений (стили scoped через CSS Modules)
