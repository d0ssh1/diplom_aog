# Behavior: Building Hierarchy

## Use Cases (карта)

| # | Кто | Что | Где |
|---|-----|-----|-----|
| UC-01 | Admin | Создаёт корпус с буквенным кодом | AdminBuildingsPage |
| UC-02 | Admin | Создаёт этаж в корпусе | AdminBuildingsPage |
| UC-03 | Admin | Загружает план в визарде с обязательным выбором корпуса+этажа | WizardPage |
| UC-04 | Admin | Multi-step wizard: загрузка фото-схемы → crop → wall extraction → разметка отсеков → привязка планов | FloorEditorPage (Wizard mode) |
| UC-05 | Admin | Видит статус привязки в редакторе плана | EditPlanPage |
| UC-06 | User | Выбирает корпус→отсек→этаж и видит 3D | FloorViewerPage |
| UC-07 | User | Строит маршрут через несколько отсеков | FloorViewerPage |
| UC-08 | Admin | Видит overview этажа со всеми отсеками + редактирует через context menu | FloorEditorPage (Overview mode) |
| UC-09 | Admin | Удаляет отсек через context menu | FloorEditorPage (Overview mode) |
| UC-10 | Admin | Переключает overview в табличный вид | FloorEditorPage (Table mode) |

---

## DFD: Полный pipeline доменной фичи

```mermaid
flowchart LR
  Admin([Admin])
  User([User])

  subgraph S1["Этап 1: Каркас"]
    BC[Create Building] --> FC[Create Floor]
  end

  subgraph S2["Этап 2: Загрузка плана"]
    UP[Wizard upload] -->|+ floor_id| RC[Create Reconstruction]
  end

  subgraph S3["Этап 3: Разметка"]
    FE[FloorEditor draw sections] --> BS[Save sections + bind plans]
  end

  subgraph S4["Этап 4: Просмотр"]
    SEL[Selector + Minimap] -->|section_id| MESH[Load mesh]
  end

  Admin --> S1 --> S2 --> S3
  User --> S4
  S3 -.->|section.reconstruction_id| S4
```

---

## UC-01: Создание корпуса

```mermaid
sequenceDiagram
  actor Admin
  participant UI as AdminBuildingsPage
  participant Hook as useBuildings
  participant API as buildingsApi
  participant Router as buildings_router
  participant Svc as BuildingService
  participant Repo as BuildingRepo
  participant DB as Database

  Admin->>UI: Заполняет форму (code="D", name="Корпус D")
  UI->>Hook: createBuilding({code, name})
  Hook->>API: POST /api/v1/buildings
  API->>Router: HTTP request
  Router->>Svc: create_building(request, current_user)
  Svc->>Svc: validate code (1-5 uppercase letters)
  Svc->>Repo: get_by_code("D")
  Repo->>DB: SELECT
  DB-->>Repo: None (свободно)
  Svc->>Repo: create(code, name, address)
  Repo->>DB: INSERT
  DB-->>Repo: id=42
  Repo-->>Svc: Building entity
  Svc-->>Router: Building
  Router-->>API: 201 BuildingResponse
  API-->>Hook: BuildingResponse
  Hook-->>UI: state update → list refresh
  UI-->>Admin: Карточка корпуса в списке
```

**Error cases:**

| Условие | HTTP | Тело | Поведение |
|---------|------|------|-----------|
| code занят | 409 | `{"detail": "Building with code 'D' already exists"}` | Подсветить поле code |
| code не валиден (формат) | 422 | Pydantic ValidationError | Не отправлять запрос (frontend validate) |
| Не админ | 403 | `{"detail": "Forbidden"}` | Показать toast |

**Edge cases:**
- Код регистронезависимый при поиске, но нормализуется в UPPER при сохранении (`"d"` → `"D"`)
- Удаление корпуса с этажами — каскадно удаляет этажи, секции; reconstructions становятся «висячими» (floor_id = NULL)

---

## UC-02: Создание этажа

```mermaid
sequenceDiagram
  actor Admin
  participant UI as AdminBuildingsPage
  participant Hook as useFloors
  participant API as buildingsApi
  participant Router as floors_router
  participant Svc as FloorService
  participant RepoB as BuildingRepo
  participant RepoF as FloorRepo
  participant DB as Database

  Admin->>UI: В карточке корпуса D → "Добавить этаж 7"
  UI->>Hook: createFloor(buildingId=42, number=7)
  Hook->>API: POST /api/v1/buildings/42/floors
  API->>Router: HTTP request
  Router->>Svc: create_floor(building_id=42, number=7)
  Svc->>RepoB: get_by_id(42)
  RepoB->>DB: SELECT
  DB-->>RepoB: Building(42, "D")
  Svc->>RepoF: get_by_building_and_number(42, 7)
  RepoF->>DB: SELECT
  DB-->>RepoF: None
  Svc->>RepoF: create(building_id=42, number=7)
  RepoF->>DB: INSERT
  DB-->>RepoF: id=101
  Svc-->>Router: Floor
  Router-->>UI: 201 FloorResponse
  UI-->>Admin: Этаж 7 в списке
```

**Errors:** 404 если building не найден; 409 если этаж с таким номером уже есть в корпусе.

---

## UC-03: Wizard с обязательной привязкой к корпусу+этажу

```mermaid
sequenceDiagram
  actor Admin
  participant UI as WizardPage StepUpload
  participant Hook as useWizard
  participant Up as useFileUpload
  participant API as apiService
  participant Router as reconstruction_router

  Admin->>UI: Загружает файл
  Up->>API: POST /upload/plan-photo (multipart)
  API-->>Up: {file_id}
  UI->>UI: Показ превью
  UI->>Hook: getBuildings() / getFloors(buildingId)
  Hook->>API: GET /api/v1/buildings, /buildings/{id}/floors
  API-->>Hook: списки
  Hook-->>UI: dropdown options

  Admin->>UI: Выбирает Корпус D, Этаж 7
  UI->>UI: validate (оба поля заполнены) → enable Next
  UI->>API: PATCH /reconstruction/reconstructions/{id} {floor_id: 101} (ранняя привязка, ADR-24)
  API-->>UI: 200 (план теперь привязан к этажу, попадёт в список unbound при status=Done)

  Note over UI,API: Шаги Preprocess → WallEditor → Build → ... как сейчас

  Admin->>UI: Шаг Save (имя плана)
  UI->>API: PUT /reconstruction/reconstructions/{id}/save<br/>{name, floor_id}
  API->>Router: HTTP
  Router->>Svc: ReconstructionService.save(id, name, floor_id)
  Svc->>FloorRepo: get_by_id(floor_id) (404 если нет)
  Svc->>ReconstructionRepo: update(id, name, floor_id)
  Svc-->>Router: Reconstruction
  Router-->>UI: 200 ReconstructionResponse (floor_id, section=null)
  UI-->>Admin: "Сохранено. План не привязан к отсеку — откройте редактор схемы этажа"
```

**Изменения в текущем wizard:**
- `frontend/src/components/Wizard/StepUpload.tsx` — `MetadataForm` заменяется на `BuildingFloorPicker` (два связанных dropdown'а)
- `frontend/src/components/Wizard/StepSave.tsx` — поля building/floor убраны (уже выбраны), остаётся только имя
- `frontend/src/hooks/useWizard.ts` — добавляется `floorId` в state, валидация перехода на следующий шаг
- `backend/app/api/reconstruction.py` — endpoint `/save` принимает `floor_id` вместо `building_id`+`floor_number`

**Errors:**

| Условие | HTTP | Поведение |
|---------|------|-----------|
| Нет корпусов в системе | — | StepUpload показывает кнопку «Создать корпус» (ссылка на /admin/buildings) |
| Нет этажей в выбранном корпусе | — | Аналогично |
| floor_id не найден на сохранении | 404 | Toast «Этаж был удалён, выберите другой» |

---

## UC-04: Multi-step wizard разметки этажа и привязки планов

Реализован как 5 последовательных шагов внутри `FloorEditorPage` в режиме «Wizard». Запускается:
- При открытии страницы (`/admin/floor-editor`) с пустым этажом — автоматически
- При нажатии «Сохранить изменения» в Overview — нет, это сохранение
- При нажатии «Редактировать схему» в Table view — переход на шаг 1 с предзагруженными данными

После завершения шага 5 — переход в режим Overview (UC-08).

**State wizard'a** (управляется `useFloorEditorWizard`):
```typescript
{
  currentStep: 1 | 2 | 3 | 4 | 5;
  buildingId, floorId: number;
  schemaImageId: string | null;          // загружено на шаге 1
  schemaImageUrl: string | null;
  cropBbox: { x, y, w, h, rotation } | null;  // шаг 2
  wallPolygons: Point[][] | null;         // шаг 3
  sectionDrafts: SectionDraft[];          // шаги 4-5
  isDirty: boolean;
}
```

### UC-04.1: Шаг 1 — Загрузка фото-схемы этажа

```mermaid
sequenceDiagram
  actor Admin
  participant UI as Step1Upload
  participant Hook as useFloorEditorWizard
  participant API
  participant Router as floor_schema_router

  Admin->>UI: Открывает /admin/floor-editor, выбирает Корпус D, Этаж 7
  UI->>Hook: loadFloorState(floorId=101)
  Hook->>API: GET /api/v1/floors/101 (с schema_image_id, wall_polygons)
  API-->>Hook: FloorWithSchemaResponse
  alt schema_image_id is null (новый этаж)
    Hook-->>UI: state: currentStep=1, нет данных
    UI-->>Admin: DropZone "Загрузите изображение плана этажа (JPG, PNG, PDF)"
    Admin->>UI: Выбирает файл
    UI->>API: POST /upload/plan-photo (multipart, file_type=4=FloorSchema)
    API-->>UI: {file_id, url}
    UI->>API: PUT /api/v1/floors/101/schema {schema_image_id}
    API-->>UI: 200
    UI->>Hook: setSchemaImage(file_id, url)
  else schema_image_id уже есть
    Hook-->>UI: state: currentStep=6 (Overview, см. UC-08)
  end
  Admin->>UI: Кнопка "Далее →"
  UI->>Hook: nextStep() (→2)
```

**UI:** левая панель «Источник плана» с DropZone (как на скрине шага 1). Кнопки: «← Назад» (выход из wizard'a), «Далее →» (orange, disabled пока файл не загружен).

**Errors:** invalid format (не JPG/PNG/PDF) — toast «Поддерживаются JPG, PNG, PDF». Слишком большой файл (>50MB) — toast.

---

### UC-04.2: Шаг 2 — Кадрирование и поворот

```mermaid
sequenceDiagram
  actor Admin
  participant UI as Step2CropRotate
  participant Hook as useFloorEditorWizard
  participant API

  UI-->>Admin: Показ schemaImageUrl + orange handles (resize-corners)
  Admin->>UI: Перетаскивает углы → корректирует bbox
  UI->>Hook: setCropBbox({x, y, w, h, rotation})
  Admin->>UI: Клик "Поворот" → rotation += 90°
  UI->>Hook: setCropBbox(...rotation+90)
  Admin->>UI: "Далее →"
  UI->>API: PUT /api/v1/floors/101/schema {schema_crop_bbox: {...}}
  API-->>UI: 200
  UI->>Hook: nextStep() (→3)
```

**UI:** левая панель «Инструменты»: «Кадрирование» (всегда активно), «Поворот» (кнопка, моментальное действие). Canvas с фото и оранжевыми handles. Внизу — `CanvasControls` (zoom/reset/rotate). Подсказка: «Выделите область с отсеком и нажмите Далее».

**Default:** при первом входе bbox = весь image; rotation = 0.

**Note:** название шага в макете «Кадрирование и выбор отсека» — историческое (изначально мы планировали per-section crop, отказались). Реальный смысл — **preprocessing фото-схемы целиком** (убрать рамки/подписи легенды). Подпись в UI заменяется на «Кадрирование схемы».

---

### UC-04.3: Шаг 3 — Извлечение стен (CV + ручная правка)

```mermaid
sequenceDiagram
  actor Admin
  participant UI as Step3WallExtraction
  participant Hook as useFloorEditorWizard
  participant API
  participant Router as floor_schema_router
  participant Svc as FloorSchemaService
  participant CV as processing/{binarization, contours, vectorizer}

  alt wall_polygons is null (первый раз на этом этаже)
    UI->>API: POST /api/v1/floors/101/extract-walls
    API->>Router: HTTP
    Router->>Svc: extract_walls(floor_id=101)
    Svc->>Svc: load schema_image_id, schema_crop_bbox
    Svc->>CV: preprocess_image(image, crop, rotation) → cropped/rotated np.ndarray
    Svc->>CV: binarize_image(cropped) → binary
    Svc->>CV: detect_contours(binary) → contours
    Svc->>CV: vectorize(contours) → polygons normalized [0,1]
    Svc->>Svc: save Floor.wall_polygons
    Svc-->>Router: WallPolygonsResponse
    Router-->>UI: 200 [[x,y],...]
  else wall_polygons уже есть
    UI->>Hook: load из state
  end

  UI-->>Admin: Render полигонов как линий на canvas (поверх кадрированной фото-схемы как watermark)
  loop Ручная корректировка
    Admin->>UI: Инструмент "Выделение стен" (свободное рисование линий)
    Admin->>UI: Инструмент "Прямоугольник" (быстрая прямоугольная стена)
    Admin->>UI: "Очистить всё" — confirm → wallPolygons = []
    UI->>Hook: updateWallPolygons(новый массив)
  end

  Admin->>UI: "Далее →"
  UI->>API: PUT /api/v1/floors/101/walls {wall_polygons: [...]}
  API-->>UI: 200
  UI->>Hook: nextStep() (→4)
```

**UI:** левая панель «Инструменты»: «Выделение стен» (active по умолчанию, ручное рисование линий по точкам), «Прямоугольник» (drag для прямоугольной стены), «Очистить всё». Canvas с полигонами стен на нейтральном фоне (либо фото-схема с пониженной непрозрачностью). Внизу — Canvas controls.

**Reuse существующего CV:** `processing/binarization.py`, `processing/contours.py`, `processing/vectorizer.py` уже умеют это для wall vectorization в существующем wizard. Здесь — тот же вызов, но к фото-схеме этажа, не к плану отсека.

**Errors:**
- CV не находит стен — `wall_polygons = []`, пользователь рисует вручную
- Файл повреждён — 500 от processing → toast «Ошибка обработки изображения»

---

### UC-04.4: Шаг 4 — Разметка отсеков (rect + номер)

```mermaid
sequenceDiagram
  actor Admin
  participant UI as Step4MarkSections
  participant Dlg as NewSectionDialog (modal)
  participant Hook as useFloorEditorWizard

  UI-->>Admin: Render wall_polygons как фон + уже добавленные отсеки (drafts)
  Admin->>UI: Активирует "Прямоугольник" (default tool)
  Admin->>UI: mousedown + drag → mouseup
  UI->>Dlg: open({number: автонапр. (max+1)})
  Admin->>Dlg: Вводит номер (или принимает default)
  Admin->>Dlg: "Применить"
  Dlg->>Hook: addSectionDraft({geometry: 4-point quad, number, reconstruction_id: null})
  Hook-->>UI: re-render с новой секцией (orange filled, цифра в центре)

  Admin->>UI: Опционально rotate секции (drag handles после select)
  Admin->>UI: "Очистить всё" → confirm → drafts=[]

  Admin->>UI: "Далее →"
  UI->>Hook: nextStep() (→5)
```

**UI:** левая панель «Инструменты»: «Выделение стен» (вернуться к редактированию стен), «Прямоугольник» (default), «Очистить всё». Canvas с wall_polygons как фон + уже размеченные секции с номерами. Подсказка: «Выделите прямоугольником отсек и задайте номер».

**Модалка `NewSectionDialog`** (твоё требование — поверх canvas, не side panel):
- Заголовок «Новый отсек»
- Поле «Номер отсека» (обязательное, число ≥ 1, default = max существующих + 1)
- Кнопки: «Отмена», «Применить» (orange)
- НЕТ полей описания/цвета — фиксированный оранжевый, без description

**Validation на клиенте:**
- Номер уникален среди drafts → иначе inline error «Отсек с номером N уже существует»

**Геометрия:** прямоугольник хранится как 4-точечный полигон (corners). При rotate — точки пересчитываются. Допускает любую ориентацию.

---

### UC-04.5: Шаг 5 — Привязка отсеков к планам (галерея)

```mermaid
sequenceDiagram
  actor Admin
  participant UI as Step5BindPlans
  participant Gallery as PlanGalleryPicker
  participant Hook as useFloorEditorWizard
  participant API

  UI->>API: GET /reconstruction/reconstructions?status=Done (все done-планы)
  API-->>UI: ReconstructionListItem[] с floor.building.code
  UI-->>Admin: Слева — список отсеков (1, 2, 3, ...); первый выбран
  UI-->>Gallery: render карточки всех Done-реконструкций

  Admin->>UI: Кликает Отсек 1 (orange highlight)
  Admin->>Gallery: Поиск "А11"
  Gallery->>Gallery: filter по name
  Admin->>Gallery: Dropdown "Здание" → выбирает "А"
  Admin->>Gallery: Dropdown "Этаж" → выбирает "11"
  Gallery-->>UI: filtered cards (А11.1, А11.2, ..., А11.5)

  Admin->>Gallery: Клик карточки "А11.4"
  Gallery->>Hook: bindReconstruction(sectionIdx=0, reconstruction_id=...)
  Hook-->>UI: secitons[0].reconstruction_id = ..., карточка с checkmark

  Admin->>UI: Переключается на Отсек 2 → bind следующего плана
  Note over Admin,Hook: ... повторяется для всех отсеков

  Admin->>UI: "Сохранить" (orange)
  UI->>Hook: saveAll()
```

**Save flow** (`saveAll()`):

```mermaid
sequenceDiagram
  participant Hook as useFloorEditorWizard
  participant API
  participant Svc as SectionService
  participant DB

  Note over Hook,DB: Транзакция
  Hook->>API: PUT /api/v1/floors/101/sections {sections: [...drafts]}
  API->>Svc: replace_sections(floor_id, drafts)
  Svc->>Svc: validate (уникальность number, FK reconstruction_id — но допускаются ИЗ ЛЮБОГО этажа)
  Svc->>DB: DELETE FROM sections WHERE floor_id=101
  Svc->>DB: INSERT all drafts
  Svc-->>API: list[Section]
  API-->>Hook: 200
  Hook->>Hook: переход в Overview mode (UC-08)
```

**Изменение в SectionService validation:** допускается reconstruction_id, чьё `Reconstruction.floor_id != floor_id` (галерея не ограничивает по этажу — ADR-17 reverse). Единственная проверка — reconstruction должен существовать и не быть привязан к другой секции.

**Кнопки:**
- «Сохранить и выйти» — save + редирект в Overview
- «Сохранить» (orange) — save + остаться, дать возможность ещё раз пройти wizard

**Errors:**
- Дубль номера — 422, toast
- Reconstruction уже в другой секции — 422, подсветка проблемного отсека

**Edge cases:**
- Не все отсеки привязаны — допустимо. Пустые reconstruction_id остаются null. План «не привязан» в end-user UI скрыт.
- Номер пропущен (1, 2, 4) — допустимо, нет требования последовательности.

---

## UC-05: Плашка статуса в EditPlanPage

```mermaid
sequenceDiagram
  actor Admin
  participant UI as EditPlanPage
  participant API
  participant Router as reconstruction_router

  Admin->>UI: Открывает /admin/edit/555
  UI->>API: GET /reconstruction/reconstructions/555
  API->>Router: HTTP
  Router-->>UI: ReconstructionResponse + floor + section
  UI-->>Admin: Рендер канваса + плашка<br/>"Привязан к отсеку №4 (Корпус D, этаж 7)" с кнопкой "Сменить"
```

**Backend:** в `ReconstructionResponse` добавляются вычисляемые поля `floor` (вложенный {id, number, building: {id, code, name}}) и `section` (вложенный {id, number} | null), вычисляются через JOIN в `reconstruction_repo.get_by_id`.

---

## UC-06: End-user — выбор отсека и просмотр

```mermaid
sequenceDiagram
  actor User
  participant UI as FloorViewerPage
  participant Hook as useFloorViewer
  participant API
  participant Three as MeshViewer

  User->>UI: Открывает /viewer
  UI->>Hook: loadCatalog()
  Hook->>API: GET /api/v1/buildings?published=true
  API-->>Hook: PublicBuilding[] (со вложенными floors→sections→mesh_url)
  Hook-->>UI: state: catalog

  User->>UI: Кликает корпус "D"
  UI->>Hook: selectBuilding("D")
  Hook->>Hook: первый этаж корпуса по умолчанию (только из visible-floors)
  Hook-->>UI: visibleFloors=[7,8] (этаж 6 пустой — скрыт), sections=[2,3,4,5], active=2

  User->>UI: Меняет этаж на 8
  UI->>Hook: selectFloor(8)
  Hook->>Hook: новые секции этажа 8 = [3,5,9]
  Hook->>Hook: если activeSection (2) НЕ в новом списке → fallback на первую (3)
  Hook-->>UI: sections=[3,5,9], active=3 (или сохранён 4 если был)

  User->>UI: Кликает отсек "5" (или меняет в селекторе)
  UI->>Hook: selectSection(5)
  Hook-->>UI: activeSection=5 → meshUrl выводится из catalog
  UI->>Three: load mesh by URL
  Three-->>UI: render
  UI-->>User: 3D отсека 5 + мини-карта с подсветкой
```

**Loading mesh:** mesh-URL берётся из ответа `/buildings?published=true` (denormalized). Снижает latency при переключении отсеков.

**Filtering "published" (иерархическое, ADR-21):** в каталоге `?published=true` рекурсивно фильтруются:
- секции — только с `reconstruction.status=Done`
- этажи — только если у них осталось ≥ 1 такая секция
- корпуса — только если у них остался ≥ 1 такой этаж

Это гарантирует, что end-user не увидит пустые этажи или корпуса без контента.

**Errors:**

| Условие | Поведение |
|---------|-----------|
| Нет ни одного "опубликованного" корпуса | Заглушка "Контент пока не загружен" |
| У выбранного отсека нет mesh (статус не Done) | Показать заглушку "План в обработке" |

---

## UC-07: Маршрут через несколько отсеков

Использует **существующий** `POST /navigation/multifloor-route`. Никаких изменений в backend-логике маршрутизации.

```mermaid
sequenceDiagram
  actor User
  participant UI as FloorViewerPage
  participant Hook as useFloorViewer
  participant API
  participant Three as MeshViewer

  User->>UI: Вводит "D304" в start, "D712" в end
  UI->>Hook: planRoute(start, end)
  Hook->>API: POST /navigation/multifloor-route<br/>{building_id, from_reconstruction_id, from_room_id, to_reconstruction_id, to_room_id}
  API-->>Hook: MultifloorRouteResponse (path_segments per reconstruction)
  Hook->>Hook: для каждого сегмента — найти секцию (reconstruction_id → section.number)
  Hook-->>UI: маршрут по отсекам [4, 5, 7]
  UI->>UI: Подсветка отсеков пути на мини-карте оранжевым контуром
  UI->>Three: загрузка mesh первого отсека в маршруте
  User->>UI: Прокликивает следующий отсек
```

**Mapping segment → section:** `useFloorViewer` строит вспомогательный индекс `reconstructionId → sectionId` при загрузке каталога; используется для подсветки и для меток сегментов.

---

## UC-08: Overview — графический вид + Context Menu

```mermaid
sequenceDiagram
  actor Admin
  participant UI as FloorEditorPage (Overview mode)
  participant Hook as useFloorSections
  participant API

  Note over UI: Запускается после save (UC-04.5) или при открытии этажа с уже размеченными секциями
  UI->>Hook: loadFor(floorId)
  Hook->>API: GET /api/v1/floors/101/sections + GET /floors/101 (для wall_polygons + schema_image)
  API-->>UI: sections[] + Floor

  UI-->>Admin: Слева — список отсеков (номер + "Корпус N"), справа — canvas с wall_polygons фоном + sections (нейтральный цвет, активная — orange)
  UI-->>Admin: Снизу: "Всего отсеков: N", "Привязано: M", кнопка "Сохранить изменения" (orange)

  Admin->>UI: Right-click (или click) на отсек
  UI->>UI: openContextMenu(sectionId, position)
  UI-->>Admin: Меню с двумя пунктами: "Изменить номер", "Удалить отсек"

  alt "Изменить номер"
    Admin->>UI: Клик
    UI-->>Admin: NewSectionDialog (re-use модалки из UC-04.4) с current number
    Admin->>UI: Меняет номер → "Применить"
    UI->>Hook: updateSection(id, {number})
    Hook->>Hook: isDirty=true (не сохраняем сразу, ждём кнопку "Сохранить изменения")
  else "Удалить отсек" (UC-09)
    см. ниже
  end

  Admin->>UI: "Сохранить изменения"
  UI->>API: PUT /api/v1/floors/101/sections {...current state}
  API-->>UI: 200
  UI-->>Admin: Toast "Сохранено"
```

**Canvas рендер:**
- Background: cropped+rotated `schema_image_url` (применённое kropирование) с пониженной непрозрачностью
- Wall polygons: чёрные линии поверх (отрисовка как `<polyline>` или `<path>` в SVG)
- Section polygons: нейтральный outline + цифра в центре. **Активная** (если выбрана в списке слева) — оранжевая заливка с прозрачностью
- Тех же `CanvasControls` (zoom/reset)

**Note:** мокап шага 6 в моменте показывает отсеки с разными цветами outline — это **визуальное упрощение макета**. Реализация: один цвет (нейтральный), активная — orange. См. ADR-26 (отказ от Section.color).

**Кнопка-переключатель режимов:** «Графический / Табличный» — переключает Overview ↔ Table view (UC-10).

---

## UC-09: Удаление отсека

```mermaid
sequenceDiagram
  actor Admin
  participant UI as Overview
  participant Hook as useFloorSections

  Admin->>UI: Context menu → "Удалить отсек"
  UI-->>Admin: Confirm "Удалить отсек №N? Действие нельзя отменить без перезагрузки"
  Admin->>UI: Подтверждает
  UI->>Hook: deleteSection(id) (только локально)
  Hook->>Hook: isDirty=true, отсек убран из state
  UI-->>Admin: Канвас обновлён без секции

  Admin->>UI: "Сохранить изменения"
  UI->>API: PUT /api/v1/floors/{id}/sections (новый набор без удалённой)
  API-->>UI: 200
```

**Note:** удаление **локальное** до save. Это согласуется с replace-стратегией. После save — у удалённой секции `Reconstruction.floor_id` остаётся (план становится «висящим», доступным для перепривязки в новом проходе wizard'a).

---

## UC-10: Табличный вид

```mermaid
sequenceDiagram
  actor Admin
  participant UI as FloorEditorPage (Table mode)
  participant Hook as useFloorSections

  Admin->>UI: Click "Табличный вид" в Overview
  UI->>UI: switchView('table')
  UI-->>Admin: Таблица со столбцами: Номер | План | Статус | Действия

  Note over UI: Поле "Описание" из мокапа НЕ реализуется (ADR-25, no description)

  loop По каждому отсеку
    UI-->>Admin: Row с номером, привязанным планом ("А11.4 — Этаж 11 — Отсек 4" или "—"), статусом ("Привязан"/"Не привязан"), иконками edit/delete
  end

  alt Edit (карандаш)
    Admin->>UI: Клик
    UI-->>Admin: NewSectionDialog (re-use модалки) с current number
    Admin->>UI: Меняет → "Применить"
  else Delete (корзина)
    Admin->>UI: Клик → confirm → как в UC-09
  end

  UI-->>Admin: Кнопка "Редактировать схему" (orange) — переход в Wizard mode (шаг 1) с предзагруженным состоянием для пере-разметки
  UI-->>Admin: Кнопка "Сохранить изменения" — save (как в UC-08)
```

**Note:** "Экспорт схемы" (видна на мокапе шага 8) **не реализуется** в первой итерации (твой ответ: «Экспорт схемы не нужно делать»).
