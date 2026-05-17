# UI Spec: user-floor-viewer

Визуальная спецификация под скриншот-макет. Источник правды для верстальщика. Все размеры — пиксели; цвета — hex; шрифты — system stack (как сейчас в проекте).

---

## 1. Глобальный layout

```
┌────────────────────────────────────────────────────────────────────┐
│ ▒ "Пользователь-начало" (label-крошка над приложением, серый 12px) │
├────────────────────────────────────────────────────────────────────┤
│ ████████████████████████████████████████████████████████████████  │  ← Header (чёрный, 56px)
│  ← ДВФУ  ›  Корпус D                                              │
├──────────────┬─────────────────────────────────────────────────────┤
│              │                                                     │
│ Left panel   │              3D viewport (белый/very-light grey)    │
│ 280px        │                                                     │
│ белый фон    │                                          ┌──┐       │
│              │                                          │+ │       │
│ [Начальная]  │                                          ├──┤       │
│ [Конечная]⇄  │                                          │− │       │
│ [Построить]  │                                          └──┘       │
│              │                                                     │
│ Корпус       │                                                     │
│ < S [D] B >  │                                                     │
│ Отсек        │                                                     │
│ < 3 [4] 5 >  │                                                     │
│ Этаж         │                                                     │
│ < 6 [7] 8 >  │                                                     │
│              │                                                     │
│ ┌──Минимапа─┐│                                                     │
│ │           ││                                                     │
│ └───────────┘│                                                     │
└──────────────┴─────────────────────────────────────────────────────┘
```

**Структура DOM:**

```
.page (flex column, 100vh)
  .pageLabel       (опционально — "Пользователь-начало", над хедером)
  .header          (height 56px)
  .body            (flex row, flex:1)
    .leftPanel     (width 280px)
      .routeSection
      .selectorSection
      .minimapSection
    .rightPanel    (flex:1, position:relative)
      .viewerContainer
      .zoomControls (position:absolute right:16 центрировано по вертикали)
```

---

## 2. Дизайн-токены

### Цвета

| Назначение | Hex | Где |
|---|---|---|
| Brand orange (primary) | `#F97316` | Кнопка «Построить маршрут», active-кнопка селектора, фокус полей |
| Brand orange hover | `#EA6C0A` | hover primary |
| Black surface | `#0E0E0E` | Header, неактивные кнопки селектора, zoom-кнопки, swap-кнопка |
| Black hover | `#222222` | hover black surfaces |
| White surface | `#FFFFFF` | Левая панель, селектор-«пилюли» неактивные (с тёмным текстом), фон |
| Viewport background | `#FFFFFF` (или `#FAFAFA`) | Правая зона 3D |
| Text primary | `#0E0E0E` | Header текст, основной текст |
| Text muted | `#888888` | Лейблы секций («Корпус», «Отсек», «Этаж») |
| Text on dark | `#FFFFFF` | Текст на чёрных кнопках |
| Text on orange | `#FFFFFF` | Текст на оранжевых элементах |
| Border light | `#E5E5E5` | Бордюры инпутов, минимапы, sections в минимапе |
| Border focus | `#F97316` | Фокус инпута |
| Error | `#DC3545` | Toast ошибки маршрута |
| Section minimap active | `#F97316` (fill) + белый текст | Активный отсек |
| Section minimap default | `#FFFFFF` fill + `#0E0E0E` stroke 1.5px + чёрный текст | Неактивный отсек |
| Section minimap highlight (маршрут) | `#F97316` stroke 2px, fill `#FFFFFF` | Отсек, через который проходит маршрут |

### Типографика

| Роль | Размер / вес | Прим. |
|---|---|---|
| Header title («ДВФУ», «Корпус D») | 15px / 600 / white | sans-serif system |
| Header «←» | 16px / 400 / white | |
| Header chevron `›` | 14px / 400 / `#6B6B6B` | разделитель |
| Page label «Пользователь-начало» | 12px / 400 / `#999` | над приложением, опционально |
| Селектор-лейбл («Корпус») | 12px / 500 / `#888` | без uppercase, без letter-spacing (отличие от текущего CSS!) |
| Селектор-пилюля (S/D/B, 3/4/5, 6/7/8) | 14px / 600 | белый текст на чёрном/оранжевом |
| Route input placeholder | 13px / 400 / `#888` | |
| Route input value | 13px / 400 / `#0E0E0E` | |
| Route button | 13px / 600 / white | |
| Minimap section number | 11px / 600 | цвет — см. таблицу состояний |

### Радиусы и тени

| Элемент | radius | shadow |
|---|---|---|
| Кнопки селектора (пилюли) | **0** (квадратные углы, скрин) | нет |
| Стрелки селектора `< >` | 0 | нет |
| Кнопка «Построить маршрут» | 0 | нет |
| Route inputs | 0 | нет |
| Swap-кнопка ⇄ | 0 | нет |
| Zoom-кнопки +/− | 0 | `0 1px 3px rgba(0,0,0,0.12)` |
| Минимапа (контейнер) | 0, border `1px #E5E5E5` | нет |

**Важно:** все углы квадратные. Это явное отличие от текущего CSS (border-radius:4px у инпутов/кнопок).

### Spacing

| Элемент | Значение |
|---|---|
| Header высота | 56px |
| Header горизонтальный padding | 24px |
| Header gap между «← ДВФУ › Корпус D» | 12px |
| Left panel ширина | **280px** (текущее: 260px) |
| Left panel padding | 16px |
| Между секциями левой панели (route → корпус → отсек → этаж → минимапа) | 16px |
| Внутри секции селектора (лейбл → ряд кнопок) | 6px |
| Gap между route inputs (Начальная / Конечная) | 6px |
| Высота route input | 36px |
| Высота route button «Построить» | 40px |
| Размер пилюли селектора (S/D/B, цифры) | 36×36 px |
| Размер стрелки селектора | 36×36 px |
| Gap между пилюлями в ряду | **0** (стык-в-стык, см. макет) |
| Минимапа высота | 200px |
| Zoom-кнопка размер | 40×40 px |
| Zoom-кнопки gap между + и − | 4px |

---

## 3. Покомпонентная разметка

### 3.1 Header (`.header`)

- Фон: `#0E0E0E`
- Высота: 56px
- Padding: `0 24px`
- Содержимое (flex row, align-items:center, gap:12px):
  - `←` (button, transparent, white, 16px)
  - `ДВФУ` (15px/600, white)
  - `›` (14px, `#6B6B6B`)
  - `Корпус {code}` (15px/600, white)
- Hover «←»: прозрачный bg → `rgba(255,255,255,0.08)`

**Опциональный label над хедером** (по скрину сверху мелким серым «Пользователь-начало»): можно опустить как комментарий-маркер сцены — это, видимо, аннотация скриншота, а не часть UI. **OUT OF SCOPE**, не реализуем.

### 3.2 Route inputs section

```
┌─────────────────────────┬────┐
│ [Начальная точка     ]  │ ⇄  │
│ [Конечная точка      ]  │    │
└─────────────────────────┴────┘
[      Построить маршрут       ]
```

- Контейнер: flex row, gap:8px
- Левый блок: flex column, gap:6px — два инпута
- Правый блок: квадрат 36×78px (или 36×36, центрированный по вертикали) — swap-кнопка ⇄
  - Фон: `#0E0E0E`, иконка ⇄ белая 18px (heroicons `arrows-right-left` или просто символ `⇄`)
  - hover: `#222`
  - onClick: меняет местами значения `Начальная` / `Конечная` (см. ADR-7 ниже)
- Под блоком: кнопка «Построить маршрут» на всю ширину (`#F97316`, white text, 40px height, no radius)
- При ошибке маршрута: `.routeError` 12px красный под кнопкой (не toast — inline)

### 3.3 Selector section («Корпус» / «Отсек» / «Этаж»)

Каждая секция:

```
Корпус                          ← 12px/500, #888, mb:6
< S [D] B >                     ← ряд 5 элементов в стык, 36×36 каждый
```

- Лейбл: одна строка, padding-left:2px
- Ряд кнопок: flex row, gap:0
- Стрелки `<` `>`: фон `#0E0E0E`, белая иконка 14px, 36×36, hover `#222`. Если в начале/конце списка — opacity:0.35, cursor:not-allowed.
- Пилюли значений:
  - **active**: фон `#F97316`, текст white
  - **inactive**: фон `#FFFFFF`, текст `#0E0E0E`, border `1px solid #0E0E0E` (тонкая чёрная рамка как на скрине)
  - hover inactive: фон `#F5F5F5`
- Размер шрифта 14px/600

**WINDOW_SIZE = 3** — показываем 3 значения вокруг активного (current behavior `CarouselRow`). Активное — по центру окна.

### 3.4 Минимапа (`.minimapSection`)

- Контейнер: white, border `1px solid #E5E5E5`, padding:12px, высота 200px
- Внутри: SVG, viewBox `0 0 1 1`, preserveAspectRatio `xMidYMid meet`
- Отсеки:
  - Прямоугольник `#FFFFFF` + stroke `#0E0E0E` width:0.005 (в SVG-юнитах)
  - Подпись `section.number` в центроиде, 11px/600, `#0E0E0E`
- Активный отсек: fill `#F97316`, stroke `#F97316`, текст white
- Отсек в маршруте (highlighted): fill `#FFFFFF`, stroke `#F97316` width:0.008, текст `#0E0E0E`
- Hover любого отсека: cursor:pointer, opacity:0.85
- Никакого лейбла-заголовка над минимапой — по скрину его нет.

### 3.5 3D viewport + zoom controls

- Фон правой зоны: `#FFFFFF` (или `#FAFAFA`). Текущий `#ECEFF1` — слишком серый.
- 3D-сцена: `MeshViewer` без изменений в логике, но `floorPlane` цвет в [MeshViewer.tsx](frontend/src/components/MeshViewer/MeshViewer.tsx) с `#F5F0E8` → `#FFFFFF` (или совсем убрать плоскость).
- Фон Three.js scene → `#FFFFFF` (вместо `#ECEFF1`).
- Цвет стен — оставляем `#BDBDBD` (на скрине стены light-grey, совпадает).

**Zoom controls** (новый компонент):
- Position: absolute, `right:16px`, центрирован по вертикали (`top:50%; transform:translateY(-50%)`)
- Две кнопки `+` / `−`, каждая 40×40, фон `#0E0E0E`, белая иконка/символ 20px/600, no radius, gap:4px между ними
- onClick: программно меняет камере `OrbitControls` — `camera.position` * 0.85 для `+` и * 1.15 для `−` (через `useThree()` ref), либо через `controls.dollyIn/dollyOut`
- Shadow: `0 1px 3px rgba(0,0,0,0.12)`

### 3.6 Toast ошибки (без изменений)

- Position: absolute top:16, центр по горизонтали
- Background: `rgba(220,53,69,0.92)`, white, padding 8×16, 14px

### 3.7 Empty state

Если каталог пуст или у текущего отсека нет `mesh_url_glb`:

```
В этом отсеке пока нет 3D-модели
```

Центр viewport, 16px, `#888`.

---

## 4. Δ vs текущий код

Что нужно поменять в существующих файлах, чтобы получить макет:

| Элемент | Файл | Что меняем |
|---|---|---|
| Хедер: белый → чёрный, текст белый, новые цвета | [FloorViewerPage.module.css:11-46](frontend/src/pages/FloorViewerPage.module.css:11) | `.header` background `#0E0E0E`, `.backBtn`/`.headerTitle` цвет → white, разделитель → `#6B6B6B` |
| Ширина левой панели 260→280 | [FloorViewerPage.module.css:58](frontend/src/pages/FloorViewerPage.module.css:58) | `width: 280px` |
| Убрать radius у инпутов/кнопки | [FloorViewerPage.module.css:83-117](frontend/src/pages/FloorViewerPage.module.css:83) | `border-radius:0` для `.routeInput`, `.routeBtn` |
| Selector «пилюли» чёрные/оранжевые квадратные | [BuildingFloorSectionSelector.module.css](frontend/src/components/FloorViewer/BuildingFloorSectionSelector.module.css) | Переписать стили под токены §2 |
| Лейбл селекторов uppercase → обычный регистр | там же | убрать `text-transform`, `letter-spacing` |
| Стрелки селектора `< >` чёрные | там же | background `#0E0E0E`, white icon |
| Минимапа: новые цвета active/highlight, чёрный stroke | [FloorMinimap.module.css](frontend/src/components/FloorViewer/FloorMinimap.module.css) | Обновить classes под §3.4 |
| Минимапа: убрать заголовок «Отсеки» | [FloorViewerPage.tsx](frontend/src/pages/FloorViewerPage.tsx) `.minimapTitle` | Удалить header-элемент |
| Цвет 3D viewport: серый → белый | [FloorViewerPage.module.css:7](frontend/src/pages/FloorViewerPage.module.css:7), [MeshViewer.tsx](frontend/src/components/MeshViewer/MeshViewer.tsx) | `.page` background `#FFF`, scene bg `#FFF`, floorPlane `#FFF` или удалить |
| Zoom-кнопки: квадратные, чёрные, по центру справа | [FloorViewerPage.module.css:200-228](frontend/src/pages/FloorViewerPage.module.css:200) | Переписать `.zoomControls`/`.zoomBtn` под §3.5, переместить из `bottom:16` в `top:50%/translateY` |

### Новые компоненты/файлы

| Файл | Что |
|---|---|
| `frontend/src/components/FloorViewer/RouteInputs.tsx` (+ `.module.css`) | Блок с двумя инпутами, swap-кнопкой и кнопкой «Построить». Принимает `start, end, onChange, onSwap, onSubmit, disabled, error`. Заменяет inline-разметку в `FloorViewerPage` |
| `frontend/src/components/FloorViewer/ZoomControls.tsx` (+ `.module.css`) | Две кнопки `+`/`−`; принимает `onZoomIn`, `onZoomOut`. Связь с `OrbitControls` — через ref/контекст из `MeshViewer` |
| (изменения) `MeshViewer.tsx` — добавить prop `controlsRef?: RefObject<OrbitControls>` или экспонировать через `useImperativeHandle` для управления камерой снаружи |

---

## 5. Дополнения к решениям (ADR-7)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| **ADR-7** | Swap-кнопка ⇄ между «Начальная» и «Конечная» | Реализуем как отдельный UI-control в `RouteInputs`. Клик меняет значения `start` ↔ `end` локально (вызов `setStart(end); setEnd(start)`). Не вызывает API. | По скриншоту это часть макета. Это бесплатный UX-плюс — никакой бэк-логики не добавляет. |
| **ADR-8** | Zoom-кнопки vs только колесо мыши | Делаем `+`/`−` как программный wrapper над `OrbitControls.dollyIn(1.15) / dollyOut(1.15)`. Колесо мыши продолжает работать как сейчас. | Скриншот показывает кнопки — обязательны. Mobile/touch без них теряет zoom. |
| **ADR-9** | Тема хедера (чёрная) vs текущая белая | Меняем под скриншот: header чёрный, viewport белый. Это согласуется с темой [PublicHomePage](frontend/src/pages/PublicHomePage.tsx) (чёрная админская кнопка справа). | Визуальная консистентность с публичной главной. |
| **ADR-10** | Углы (squircle vs sharp) | Все углы 0px (sharp). | На скриншоте все элементы строго прямоугольные. Это часть айдентики (как и в `PublicHomePage`). |

Эти ADR дополняют [03-decisions.md](03-decisions.md).

---

## 6. Acceptance Criteria (визуальные, дополняют README)

- Хедер чёрный, высота 56px, белый текст «← ДВФУ › Корпус D».
- Левая панель белая, 280px, все элементы квадратные (radius 0).
- Кнопки селектора корпус/отсек/этаж: окно из 3, чёрные стрелки `< >` 36×36, активная пилюля оранжевая, неактивные белые с чёрной рамкой.
- Кнопка «Построить маршрут» оранжевая `#F97316`, на всю ширину панели, 40px высота.
- Справа от полей маршрута есть чёрная кнопка ⇄, меняющая местами значения.
- Справа в viewport — две zoom-кнопки `+/−`, чёрные, по центру по вертикали.
- Фон 3D-viewport белый, стены модели light-grey `#BDBDBD`.
- Минимапа внизу левой панели, без заголовка, активный отсек оранжевый, отсеки маршрута — белые с оранжевой обводкой.
