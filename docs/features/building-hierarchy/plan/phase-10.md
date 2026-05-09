# Phase 10: EditPlanPage Badge

phase: 10
layer: frontend feature
depends_on: 06
design: ../02-behavior.md §UC-05

## Goal

В правом нижнем углу `EditPlanPage` — плашка с информацией о привязке к секции. Клик — переход в редактор отсеков.

## Context from Phase 06

`apiService.getReconstructionById(id)` возвращает расширенный `ReconstructionResponse` с полями `floor` (с building) и `section`. Существующий файл — `frontend/src/pages/EditPlanPage.tsx`.

## Files to Create

### `frontend/src/components/Editor/SectionBindingBadge.tsx` + `.module.css`
**Props:**
```typescript
interface Props {
  floor: { id: number; number: number; building: { code: string; name: string } } | null;
  section: { id: number; number: number } | null;
}
```

**Реализация:**
- Если `section` есть: «Привязан к отсеку №{section.number} (Корпус {building.code}, этаж {floor.number})» + кнопка-ссылка «Сменить» → `/admin/floor-editor?floor={floor.id}` (ADR-11)
- Если `section` null, но `floor` есть: «Не привязан к отсеку. Этаж: Корпус {code}, этаж {floor.number}» + кнопка «Привязать»
- Если `floor` null: «План без привязки к этажу» (исключительный случай — обычно не должно встречаться после миграции)
- Стили: фиксированное позиционирование bottom-right; полупрозрачный фон; orange акцент

## Files to Modify

### `frontend/src/pages/EditPlanPage.tsx`
**What changes:**
- В render добавить `<SectionBindingBadge floor={data.floor} section={data.section} />` после canvas-области
- Убедиться, что `data` (из существующего useEffect/hook) включает поля `floor` и `section` из расширенного response

### `frontend/src/types/reconstruction.ts` (modify in Phase 06, double-check)
Поля `floor`, `section` в `ReconstructionResponse` уже добавлены — здесь только использование.

## Verification

- [ ] `npm run build` зелёный
- [ ] Manual: открыть `/admin/edit/{id}` для висящего плана → плашка «Не привязан к отсеку»
- [ ] Manual: после привязки в /admin/floor-editor → перезагрузить EditPlanPage → плашка «Привязан к отсеку №N»
- [ ] Manual: клик «Сменить»/«Привязать» → редирект в `/admin/floor-editor?floor={id}` с предзаполненным этажом
- [ ] Плашка не перекрывает важные UI-элементы canvas
