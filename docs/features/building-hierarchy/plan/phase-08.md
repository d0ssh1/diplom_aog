# Phase 08: FloorEditorPage — Multi-step Wizard + Overview + Table

phase: 08
layer: frontend feature (admin)
depends_on: 06
design: ../02-behavior.md §UC-04 (5 sub-cases), §UC-08 (overview), §UC-09 (delete), §UC-10 (table); ../06-pipeline-spec.md (для шага 3)

## Goal

Страница `/admin/floor-editor` (label «Редактор отсеков») с тремя режимами:
- **Wizard** (5 шагов) — для пустого этажа или re-edit
- **Overview** — графический вид + context menu
- **Table** — табличный вид

Точно следует мокапу пользователя (ADR-25, 28, 32).

## Context from Phase 06

Доступны:
- `buildingsApi`, `floorsApi`, `sectionsApi`
- Новые в Phase 05/06: `floorSchemaApi.uploadSchema/extractWalls/updateWalls`, `floorsApi.getById` возвращает `FloorWithSchema`
- `apiService.getReconstructions({status, building_code, floor_id, search})` — для plan gallery
- Existing: `useFileUpload`, `useMeshViewer`, `WallEditorCanvas` (для повторного использования инструментов в шаге 3)

## Files to Create

### `frontend/src/hooks/useFloorEditorWizard.ts`

State machine управляющий currentStep + drafts:

```typescript
type EditorMode = 'wizard' | 'overview' | 'table';
type WizardStep = 1 | 2 | 3 | 4 | 5;

interface SectionDraft {
  id?: number;        // если из сохранённой секции
  number: number;
  geometry: SectionGeometry;  // 4-точечный quad
  reconstruction_id: number | null;
  reconstruction_brief?: ReconstructionBrief;  // для UI
}

interface UseFloorEditorWizardReturn {
  mode: EditorMode;
  currentStep: WizardStep;
  floorId: number | null;
  schemaImageId: string | null;
  schemaImageUrl: string | null;
  cropBbox: CropBbox | null;
  wallPolygons: Point2D[][] | null;
  sectionDrafts: SectionDraft[];
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;

  loadFor: (floorId: number) => Promise<void>;  // решает initial mode (wizard step 1 или overview)
  setMode: (mode: EditorMode) => void;
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  // wizard data setters
  setSchemaImage: (fileId: string, url: string) => Promise<void>;
  setCropBbox: (bbox: CropBbox) => void;
  commitCropBbox: () => Promise<void>;        // PUT /floors/{id}/schema
  triggerWallExtraction: () => Promise<void>; // POST /extract-walls
  setWallPolygons: (polygons: Point2D[][]) => void;
  commitWallPolygons: () => Promise<void>;    // PUT /floors/{id}/walls

  // sections
  addSectionDraft: (geometry: SectionGeometry, number: number) => void;
  updateSectionDraft: (idx: number, partial: Partial<SectionDraft>) => void;
  deleteSectionDraft: (idx: number) => void;
  bindReconstruction: (sectionIdx: number, reconstructionId: number | null) => void;
  saveAll: () => Promise<void>;               // PUT /floors/{id}/sections
}
```

**Логика загрузки (loadFor):**
```typescript
const floor = await floorsApi.getById(floorId);
// solid state from server
schemaImageId = floor.schema_image_id;
schemaImageUrl = floor.schema_image_url;
cropBbox = floor.schema_crop_bbox;
wallPolygons = floor.wall_polygons;
const sections = await sectionsApi.listByFloor(floorId);
sectionDrafts = sections.map(toDraft);

// decide mode
if (sections.length > 0) mode = 'overview';
else if (schemaImageId === null) { mode = 'wizard'; currentStep = 1 }
else if (cropBbox === null) { mode = 'wizard'; currentStep = 2 }
else if (wallPolygons === null) { mode = 'wizard'; currentStep = 3 }
else { mode = 'wizard'; currentStep = 4 }  // walls done, no sections — go mark them
```

### `frontend/src/components/FloorEditor/Step1Upload.tsx` + `.module.css`
**Точно по мокапу шага 1:**
- Header: «ДВФУ > Редактор отсеков» (breadcrumb)
- Левая панель «Источник плана» с DropZone (поддержка JPG/PNG/PDF; PDF — конвертация в PNG на клиенте через pdfjs или серверная)
- Правая панель: превью загруженного файла + подпись «Загрузите изображение плана этажа JPG, PNG, PDF» / «Рекомендуем загружать качественные фото или сканы схемы этажа»
- Низ: «← Назад» (выход), «Далее →» (orange, disabled пока не загружено)

**Behavior:** при выборе файла — `useFileUpload.upload()` → POST `/upload/plan-photo` (file_type=4=FloorSchema) → получить `file_id` → `useFloorEditorWizard.setSchemaImage(file_id, url)`. Это вызывает PUT /floors/{id}/schema с пустым crop_bbox (на этом этапе).

### `frontend/src/components/FloorEditor/Step2CropRotate.tsx` + `.module.css`
**Точно по мокапу шага 2:**
- Header breadcrumb
- Левая панель «Инструменты»: «Кадрирование» (active), «Поворот» (кнопка, instant)
- Canvas с фото + 4 orange-handles (углы) для resize crop region. Drag перемещает углы; центр — drag всей рамки
- Снизу справа: `CanvasControls` (zoom + reset + rotate-90)
- Низ: «← Назад», «Далее →», подсказка «Выделите область с отсеком и нажмите Далее»

**Реализация crop:**
- Внутренняя SVG-overlay с rect path
- Координаты handles в нормализованных [0,1] от размеров canvas (не от изображения — image fit-contain)
- При rotate — поворот image на 90° + сброс crop в полный image

**Behavior:** «Далее» → `commitCropBbox()` → PUT /floors/{id}/schema с обновлённым bbox → next step.

### `frontend/src/components/FloorEditor/Step3WallExtraction.tsx` + `.module.css`
**Точно по мокапу шага 3:**
- Header breadcrumb
- Левая панель «Инструменты»: «Выделение стен» (active), «Прямоугольник», «Очистить всё»
- Canvas с wall_polygons как чёрные линии (фон — кропнутая schema_image с opacity 0.3)
- `CanvasControls`
- Низ: «← Назад», «Далее →», подсказка «Выделите стены отсека»

**Mount behavior:**
```typescript
useEffect(() => {
  if (wallPolygons === null) {
    triggerWallExtraction();  // POST /extract-walls (показ spinner на 1-30 сек)
  }
}, []);
```

**Tools:**
- «Выделение стен» — рисование линий точка-к-точке (re-use паттерна из существующего `WallEditorCanvas` или его мини-версии)
- «Прямоугольник» — drag для axis-aligned rect (4 segment'a добавляются как один полигон)
- «Очистить всё» — confirm dialog → `setWallPolygons([])`

**Behavior:** «Далее» → `commitWallPolygons()` → PUT /floors/{id}/walls → next step.

### `frontend/src/components/FloorEditor/Step4MarkSections.tsx` + `.module.css`
**Точно по мокапу шага 4:**
- Header breadcrumb
- Левая панель «Инструменты»: «Выделение стен» (вернуться к stage 3), «Прямоугольник» (active default), «Очистить всё»
- Canvas: фон wall_polygons + уже размеченные секции (orange filled с цифрой в центре)
- `CanvasControls`
- Низ: «← Назад», «Далее →», подсказка «Выделите прямоугольником отсек и задайте номер»

**Tools:**
- «Прямоугольник» — drag → mouseup → открывает `NewSectionDialog`
- При наличии rotation handles после select — позволяет повернуть rect (генерирует 4-точечный quad)

**Behavior:** «Далее» (только если есть ≥1 отсек) → next step.

### `frontend/src/components/FloorEditor/NewSectionDialog.tsx` + `.module.css`
**Согласно требованию пользователя — модалка над canvas, НЕ side panel:**
- Position: absolute, centered over canvas (или viewport)
- Заголовок «Новый отсек»
- Поле «Номер отсека» (input number, default = max(existing) + 1)
- Inline error «Отсек с номером N уже существует»
- Кнопки: «Отмена», «Применить» (orange)

**Props:**
```typescript
interface Props {
  open: boolean;
  initialNumber: number | null;
  takenNumbers: number[];
  onConfirm: (number: number) => void;
  onCancel: () => void;
}
```

**Используется** в Step 4 (создание) и в Overview через context menu (изменение).

### `frontend/src/components/FloorEditor/Step5BindPlans.tsx` + `.module.css`
**Точно по мокапу шага 5:**
- Header breadcrumb
- Левая панель «Отсеки на схеме» — список отсеков (номер + цветной квадратик для UI distinct'a, хотя цвет фиксированный orange — квадратик показывает номер на нейтральном фоне). Активный — orange highlight
- Центр-верх: «Планы этого этажа» — заголовок, поле поиска + dropdown «Все здания» / «Все этажи»
- Центр-низ: галерея карточек (`PlanGalleryPicker`)
- Правая панель: preview активного отсека (его геометрия orange filled на фоне wall_polygons)
- Низ: «← Назад», «Сохранить и выйти», «Сохранить» (orange)

**Behavior:**
- Default фильтр: «Все здания / Все этажи / status=Done»
- Dropdown «Этаж» disabled пока не выбрано здание
- Click карточки → `bindReconstruction(sectionIdx, reconstructionId)` → checkmark на карточке
- «Сохранить» → `saveAll()` → переход в Overview
- «Сохранить и выйти» → `saveAll()` + redirect на DashboardPage

### `frontend/src/components/FloorEditor/PlanGalleryPicker.tsx` + `.module.css`
**Props:**
```typescript
interface Props {
  buildings: Building[];        // для dropdown
  selectedReconstructionId: number | null;
  onSelect: (id: number) => void;
}
```

**Внутри:**
- `useState` для search/buildingFilter/floorFilter
- `useEffect` → fetch reconstructions через `apiService.getReconstructions({status:3, building_code, floor_id, search})`
- Render: search input + 2 dropdown'а + grid карточек (thumbnail + name + «Этаж N» + checkmark если выбрана)

### `frontend/src/components/FloorEditor/FloorOverview.tsx` + `.module.css`
**Точно по мокапу шага 6:**
- Header breadcrumb
- Левая панель «Отсеки на схеме» — список (как в шаге 5)
- Canvas: фон cropped+rotated `schema_image_url` с opacity 0.3 + wall_polygons чёрными линиями + section polygons. Активная (выбранная в списке слева или последняя кликнутая) — orange filled. Остальные — neutral outline + цифра в центре.
- Низ: «← Назад», «Всего отсеков: N», «Привязано: M», «Сохранить изменения» (orange)
- Кнопка-переключатель «Графический / Табличный» (вверху справа)

**Context menu (шаг 7 мокапа):** правый клик / клик по отсеку → `SectionContextMenu` всплывает.

### `frontend/src/components/FloorEditor/SectionContextMenu.tsx` + `.module.css`
**Согласно требованию (без «Изменить цвет» — ADR-29):**
- Заголовок: пусто (просто список действий)
- Пункты:
  - «Изменить номер» (icon: edit-pencil) → открывает NewSectionDialog
  - «Удалить отсек» (icon: trash) → confirm → `deleteSectionDraft`

**Position:** абсолютно по координатам клика, авто-flip если выходит за viewport.

### `frontend/src/components/FloorEditor/FloorSectionsTable.tsx` + `.module.css`
**Точно по мокапу шага 8:**
- Header breadcrumb
- Колонки таблицы: «Номер отсека / План / Статус / Действия» (БЕЗ Описание — ADR-29; БЕЗ Экспорт — ADR README out-of-scope)
- Каждая строка:
  - Номер
  - План: «А11.4 — Этаж 11 — Отсек 4» (composed из reconstruction.name + floor.number + section.number); если null — «—»
  - Статус: badge «Привязан» (зелёный) или «Не привязан» (нейтральный)
  - Действия: иконки edit (открывает NewSectionDialog), delete (confirm → удалить)
- Кнопки сверху-справа: «Редактировать схему» (переход в wizard step 1, сброс drafts при confirm), «Сохранить изменения» (orange)
- Низ: «← Назад»

### `frontend/src/components/FloorEditor/CanvasControls.tsx` + `.module.css`
Единый компонент для шагов 2-7:
- Кнопки `+` `−` (zoom in/out)
- `xx` (reset view)
- `↻` (rotate, доступно только в шаге 2)

Просто SVG-иконки + callbacks как в макете.

### `frontend/src/pages/FloorEditorPage.tsx` + `.module.css`
Точка входа. Маршрутизирует между режимами:

```tsx
export const FloorEditorPage: React.FC = () => {
  const { buildingId, floorId, ... } = useFloorSelection();  // выбор корпуса+этажа в header
  const wizard = useFloorEditorWizard();

  useEffect(() => {
    if (floorId) wizard.loadFor(floorId);
  }, [floorId]);

  if (!floorId) return <FloorPicker /* select building+floor */ />;
  if (wizard.isLoading) return <Spinner />;

  switch (wizard.mode) {
    case 'wizard':
      switch (wizard.currentStep) {
        case 1: return <Step1Upload />;
        case 2: return <Step2CropRotate />;
        case 3: return <Step3WallExtraction />;
        case 4: return <Step4MarkSections />;
        case 5: return <Step5BindPlans />;
      }
    case 'overview': return <FloorOverview />;
    case 'table': return <FloorSectionsTable />;
  }
};
```

## Files to Modify

### `frontend/src/App.tsx`
**What changes:** route `<Route path="floor-editor" element={<FloorEditorPage />} />` внутри `/admin`.

### `frontend/src/components/Layout/AppLayout.tsx` (если есть)
**What changes:** ссылка «Редактор отсеков» в admin-меню.

## Tests

См. `../04-testing.md §Frontend Coverage` — конкретно:
- `useFloorEditorWizard.test.ts` — 4 теста state machine
- `Step2CropRotate.test.tsx` — 2 теста
- `Step3WallExtraction.test.tsx` — 2 теста
- `Step4MarkSections.test.tsx` — 2 теста
- `NewSectionDialog.test.tsx` — 2 теста
- `PlanGalleryPicker.test.tsx` — 4 теста
- `SectionContextMenu.test.tsx` — 2 теста
- `FloorSectionsTable.test.tsx` — 2 теста

## Verification

- [ ] `npm run build` зелёный
- [ ] `npm test` все frontend-тесты этой фазы зелёные
- [ ] **Manual** (полный smoke по мокапу):
  - Шаг 1: загрузить PNG → «Далее» становится активной → клик
  - Шаг 2: orange handles drag-able; «Поворот» крутит на 90° → «Далее»
  - Шаг 3: spinner ~1-3 сек → видны полигоны стен; ручная корректировка работает; «Очистить всё» с confirm → «Далее»
  - Шаг 4: drag прямоугольника → модалка `NewSectionDialog` (поверх canvas, не side panel) с default «1» → «Применить»; повторить → «Далее»
  - Шаг 5: галерея с фильтрами; выбрать отсек слева → клик карточки → checkmark; «Сохранить»
  - Overview: все секции видны нейтральным цветом, активная — orange; right-click → context menu без «Изменить цвет» → «Изменить номер» открывает модалку, «Удалить отсек» с confirm удаляет
  - «Сохранить изменения» — toast «Сохранено»
  - Переключение «Графический / Табличный» — табличный вид без столбца «Описание», без «Экспорт схемы»
  - В таблице: edit/delete иконки работают; «Редактировать схему» с confirm → wizard step 1
- [ ] Все Three.js / canvas объекты dispose'ятся на unmount каждого Step-компонента
