# Phase A3: ToolPanelV2 Component

phase: A3
layer: components/Editor
depends_on: none
design: ../README.md

## Goal

Create the new dark tool panel used by both Step 2 and Step 3. Replaces the existing
`ToolPanel.tsx`. Supports configurable sections with tool buttons and an optional
brush size slider.

## Files to Create

### `frontend/src/components/Editor/ToolPanelV2.tsx`

**Purpose:** Right-side dark panel with tool buttons grouped into sections.

**Props:**
```typescript
type ToolId = string;  // caller defines tool IDs

interface ToolButton {
  id: ToolId;
  label: string;
  icon: React.ReactNode;
}

interface ToolSection {
  title: string;       // e.g. "// ПРЕПРОЦЕССИНГ"
  tools: ToolButton[];
}

interface ToolPanelV2Props {
  sections: ToolSection[];
  activeTool: ToolId | null;
  onToolChange: (id: ToolId) => void;
  brushSize?: number;                        // if provided, show slider
  onBrushSizeChange?: (size: number) => void;
  brushSizeLabel?: string;                   // section title, default "// ТОЛЩИНА ЛИНИИ"
}
```

**Implementation details:**
- Panel: `width: 300px; background: #1a1a1a; border-left: 1px solid #2a2a2a; overflow-y: auto`
- Section title: `font-family: monospace; font-size: 12px; color: #9E9E9E; text-transform: uppercase; letter-spacing: 2px`
- Inactive button: `background: #2a2a2a; border: 2px solid transparent; color: #fff; padding: 16px 20px; width: 100%; display: flex; align-items: center; gap: 12px; border-radius: 8px`
- Active button: add `border-color: #FF5722; color: #FF5722`
- Icon container: `width: 32px; height: 32px; background: #FF5722; border-radius: 6px; display: flex; align-items: center; justify-content: center` (always orange for active, `#3a3a3a` for inactive)
- Hover: `background: #333333`
- Brush slider (if `brushSize` provided): same style as existing `ToolPanel.module.css` slider
- Note: `border-radius: 8px` on buttons is intentional per ticket spec (exception to zero-radius rule)

### `frontend/src/components/Editor/ToolPanelV2.module.css`

**Purpose:** Styles for the dark panel.

## Files to Delete (after A4 and B3 are complete)

- `frontend/src/components/Editor/ToolPanel.tsx`
- `frontend/src/components/Editor/ToolPanel.module.css`

**Note:** Delete these only after WizardPage no longer imports them (after phase B3).

## Verification
- [ ] `npx tsc --noEmit` passes
- [ ] Panel renders with dark background in browser
- [ ] Active tool button shows orange border + orange icon bg
- [ ] Brush slider visible when `brushSize` prop provided
