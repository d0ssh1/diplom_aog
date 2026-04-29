# Code Plan: test-route

date: 2026-04-29
design: ../README.md
status: approved (auto)

## Phase Strategy

**Single-phase** — фича тонкая (один хук + одна страница + один Route-биндинг),
все зависимости (компоненты, API, типы) уже существуют. Делим только для отчётности.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Hook + Page + Routing | Frontend | — | ☐ |

## File Map

### New
- `frontend/src/hooks/useRouteTest.ts` — orchestration hook
- `frontend/src/pages/RouteTestPage.tsx` — replace stub
- `frontend/src/pages/RouteTestPage.module.css` — layout

### Modified
- `frontend/src/App.tsx` — добавить `<Route path="/admin/route-test" element={<RouteTestPage/>}/>` внутри `/admin` layout

## Success Criteria

- [ ] `tsc --noEmit` clean
- [ ] eslint clean
- [ ] `vite build` clean
- [ ] Manual smoke pass (см. ../04-testing.md)
