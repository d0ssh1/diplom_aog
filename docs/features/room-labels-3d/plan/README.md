# Code Plan: Room Labels 3D

date: 2026-05-25
design: ../README.md
status: draft

## Phase Strategy

**Vertical slice** — фича полностью фронтендовая. Нет backend-слоёв.
Порядок: типы → утилиты → компонент → интеграция.

```
Phase 1 → Phase 2 → Phase 3 → Phase 4
  ↓           ↓         ↓         ↓
Types     Utils      RoomOverlay  Integration
```

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Типы и конвертеры | types/ | — | ☐ |
| 2 | RoomOverlay компонент | components/MeshViewer/ | Phase 1 | ☐ |
| 3 | Расширение MeshViewer + ViewerControls | components/MeshViewer/ | Phase 2 | ☐ |
| 4 | Интеграция в StepView3D и EditPlanPage | pages/ + components/Wizard/ | Phase 3 | ☐ |

## File Map

### Новые файлы
- `frontend/src/types/roomDisplay.ts` — тип RoomDisplay, конвертеры, normalizedToWorld
- `frontend/src/components/MeshViewer/RoomOverlay.tsx` — Three.js компонент с Html-метками
- `frontend/src/components/MeshViewer/RoomOverlay.module.css` — стиль Html-метки
- `frontend/src/__tests__/roomDisplay.test.ts` — unit-тесты конвертеров

### Изменённые файлы
- `frontend/src/components/MeshViewer.tsx` — новые props: rooms?, showRooms?
- `frontend/src/components/MeshViewer/ViewerControls.tsx` — кнопка «Кабинеты»
- `frontend/src/components/Wizard/StepView3D.tsx` — передаёт rooms + управляет showRooms
- `frontend/src/pages/EditPlanPage.tsx` — fetches /vectors, передаёт rooms

## Success Criteria

- [ ] Все фазы завершены
- [ ] `npm run build` — чистый (0 ошибок TypeScript)
- [ ] Unit-тесты проходят: `npm test -- roomDisplay`
- [ ] Визуальная проверка: в wizard шаг 5 → «Кабинеты» показывает метки
- [ ] Визуальная проверка: EditPlanPage шаг 2 (meshUrl) → «Кабинеты» работает
- [ ] Вращение камеры — метки следуют за 3D позицией
- [ ] Unmount — нет ошибок в консоли
- [ ] Все acceptance criteria из ../README.md выполнены
