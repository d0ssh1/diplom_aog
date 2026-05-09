# Phase 09: Wizard Modifications

phase: 09
layer: frontend feature
depends_on: 06
design: ../02-behavior.md §UC-03, ADR-24

## Goal

Wizard загрузки плана: на шаге StepUpload поля корпус+этаж становятся обязательными (выбор из dropdown), сразу после выбора — PATCH /reconstructions/{id} (ранняя привязка). На StepSave поля корпуса/этажа удаляются.

## Context from Phase 06

Доступны `buildingsApi`, `floorsApi`, `apiService.patchReconstructionFloor`, `apiService.saveReconstruction(id, name, floorId)`. Существующий wizard — `frontend/src/components/Wizard/WizardShell.tsx` + `Step*.tsx`, hook `useWizard.ts`, существующий `MetadataForm.tsx` (заменяется).

## Files to Create

### `frontend/src/components/Upload/BuildingFloorPicker.tsx` + `.module.css`
**Props:**
```typescript
interface Props {
  selectedBuildingId: number | null;
  selectedFloorId: number | null;
  onChange: (data: { buildingId: number | null; floorId: number | null }) => void;
  disabled?: boolean;
}
```

**Реализация:**
- Два связанных dropdown'а: Корпус (loading через `useBuildings`), Этаж (loading через `useFloors(buildingId)` после выбора корпуса)
- При смене корпуса — сбросить выбор этажа
- Если корпусов нет — показать ссылку «Создать корпус» на `/admin/buildings`
- Если выбран корпус, но нет этажей — аналогичная ссылка
- Замена поля — оба должны быть выбраны для валидности (пропс или imperative `isValid()`)

## Files to Modify

### `frontend/src/components/Wizard/StepUpload.tsx`
**What changes:**
- Удалить `MetadataForm`
- Добавить `BuildingFloorPicker` после превью файла
- Кнопка Next в WizardShell должна быть `disabled` пока `floorId` не установлен (через состояние useWizard)
- При выборе floorId, если уже есть `reconstructionId` (план уже создан calculateMesh'ом) — вызвать `patchReconstructionFloor(reconstructionId, floorId)` (debounced или сразу)

### `frontend/src/components/Wizard/StepSave.tsx`
**What changes:**
- Удалить поля `buildingId` и `floorNumber` из state и формы
- Оставить только поле «Название»
- `onSubmit(name)` → вызывает `apiService.saveReconstruction(id, name, floorId)` где floorId берётся из useWizard state

### `frontend/src/hooks/useWizard.ts`
**What changes:**
- Добавить `floorId: number | null` в state + setter `setFloor(buildingId, floorId)`
- При вызове `setFloor` — вызывать `patchReconstructionFloor` если reconstructionId уже создан
- Добавить getter `canProceedFromUpload: boolean` — true если файл загружен И floorId выбран
- Метод `save(name: string)` — переписать чтобы использовал `floorId` из state

### `frontend/src/components/Wizard/WizardShell.tsx`
**What changes:**
- Использовать `canProceedFromUpload` для disabled-состояния кнопки Next на шаге 0 (Upload)
- На шагах preprocess/wallEditor/build/view3d/save floorId должен быть «зафиксирован» (нельзя сменить — иначе реконструкция уже принадлежит этажу)

## Verification

- [ ] `npm run build` зелёный
- [ ] Manual: открыть `/upload`, загрузить файл — Next disabled
- [ ] Manual: выбрать корпус — Next всё ещё disabled (нет этажа)
- [ ] Manual: выбрать этаж — Next enabled
- [ ] Manual: после выбора этажа сетевой запрос `PATCH /reconstruction/reconstructions/{id}` ушёл (DevTools → Network)
- [ ] Manual: пройти все шаги, save без указания корпуса/этажа на StepSave — успешно (имя единственное обязательное)
- [ ] Manual: открыть `/admin/floor-editor` для этого этажа — план виден в списке висящих
- [ ] Если корпусов нет в системе — на StepUpload видна ссылка «Создать корпус»
