# Phase 5: Upload Components

phase: 5
layer: components/Upload/
depends_on: phase-02
design: ../01-architecture.md, ../02-behavior.md

## Goal

Создать компоненты для шага 1 wizard: DropZone (drag-drop зона), FileGrid (сетка превью), FileCard (карточка файла), MetadataForm (форма метаданных).

## Context

Phase 1-2 создали:
- `types/wizard.ts` — `UploadedFile` (id, url, name)
- `components/UI/Button.tsx` — используется в DropZone ("Выбрать файлы")
- `styles/globals.css` — `--color-orange`, `--color-grey-bg`, `--color-grey-light`

## Files to Create

### `frontend/src/components/Upload/DropZone.tsx`
**Purpose:** Drag-and-drop зона загрузки файлов.

```typescript
interface DropZoneProps {
  onFileSelect: (file: File) => void;
  isUploading: boolean;
  accept?: string; // default: "image/*"
}
```
- Пунктирная оранжевая рамка (`border: 2px dashed var(--color-orange)`)
- По центру: иконка облака (lucide-react `Upload`), текст "Перетащите для загрузки"
- Кнопка "Выбрать файлы" (primary Button)
- Нативный HTML5 drag-drop: `onDragOver`, `onDrop`
- Скрытый `<input type="file">` для клика

### `frontend/src/components/Upload/DropZone.module.css`
Стили DropZone.

### `frontend/src/components/Upload/FileCard.tsx`
**Purpose:** Карточка одного файла с превью и кнопкой удаления.

```typescript
interface FileCardProps {
  file: UploadedFile;
  onRemove: (id: string) => void;
}
```
- Превью: `<img src={file.url}>` серый прямоугольник ~150×100px
- Оранжевый × в правом верхнем углу (~24×24px)
- Имя файла под превью

### `frontend/src/components/Upload/FileCard.module.css`
Стили FileCard.

### `frontend/src/components/Upload/FileGrid.tsx`
**Purpose:** Сетка карточек файлов (3 в ряд).

```typescript
interface FileGridProps {
  files: UploadedFile[];
  onRemove: (id: string) => void;
  singleFile?: boolean; // если true — показать превью + MetadataForm
}
```
- Если `files.length === 0`: EmptyState (иконка ×, "Нет загруженных планов")
- Если `singleFile && files.length === 1`: тёмно-серый фон, превью + MetadataForm
- Если `files.length > 1`: CSS grid 3 колонки, FileCard[]

### `frontend/src/components/Upload/FileGrid.module.css`
Стили FileGrid.

### `frontend/src/components/Upload/MetadataForm.tsx`
**Purpose:** Форма метаданных плана (Здание/Этаж/Крыло/Блок).

```typescript
interface MetadataFormProps {
  onChange?: (data: PlanMetadata) => void;
}

interface PlanMetadata {
  building: string;
  floor: string;
  wing: string;
  block: string;
}
```
- Каждое поле: лейбл + текстовый инпут с префиксом "> "
- Данные хранятся локально (не отправляются на бэкенд в текущей версии)

### `frontend/src/components/Upload/MetadataForm.module.css`
Стили MetadataForm.

## Verification
- [ ] `cd frontend && npx tsc --noEmit` — 0 ошибок
- [ ] Нет `any`, нет inline-стилей
- [ ] DropZone не вызывает API напрямую — только `onFileSelect` callback
