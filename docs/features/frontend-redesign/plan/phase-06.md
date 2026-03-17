# Phase 6: Editor Components

phase: 6
layer: components/Editor/
depends_on: phase-02
design: ../01-architecture.md, ../02-behavior.md

## Goal

Создать ToolPanel — правую панель инструментов для шага 2 wizard (кадрирование, кисть, ластик, слайдер толщины). MaskEditor уже существует и сохраняется без изменений.

## Context

Phase 1-2 создали:
- `components/UI/IconButton.tsx` — квадратные оранжевые кнопки-иконки 80×80px
- `components/UI/Slider.tsx` — слайдер толщины
- `styles/globals.css` — `--color-grey-dark: #4A4A4A` (фон правой панели)

Существующий файл (не изменять):
- `frontend/src/components/MaskEditor.tsx:10` — Fabric.js canvas, props: `planUrl, maskUrl?, onSave`

## Files to Create

### `frontend/src/components/Editor/ToolPanel.tsx`
**Purpose:** Правая панель инструментов для редактирования маски.

```typescript
type EditorTool = 'crop' | 'auto' | 'brush' | 'eraser';

interface ToolPanelProps {
  activeTool: EditorTool;
  brushSize: number;
  onToolChange: (tool: EditorTool) => void;
  onBrushSizeChange: (size: number) => void;
}
```

Структура панели (сверху вниз):
1. Секция "// Кадрирование" — две IconButton: crop (lucide `Crop`), auto (lucide `Sparkles`)
2. Секция "// Редактировать" — две IconButton: brush (lucide `Paintbrush`), eraser (lucide `Eraser`)
3. Секция "// Толщина" — Slider (min=1, max=50, label="px")

Каждая секция:
- Заголовок: italic bold 28px, белый текст, с префиксом "//"
- Кнопки в ряд

### `frontend/src/components/Editor/ToolPanel.module.css`
Стили ToolPanel:
- Фон: `--color-grey-dark` (#4A4A4A)
- Ширина: ~25% или 280px
- Текст секций: белый
- Padding: 24px

## Verification
- [ ] `cd frontend && npx tsc --noEmit` — 0 ошибок
- [ ] Нет `any`, нет inline-стилей
- [ ] ToolPanel не импортирует MaskEditor — только передаёт props вверх через callbacks
- [ ] `MaskEditor.tsx` не изменён
