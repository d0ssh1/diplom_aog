# Phase 2: Frontend — фикс роута `/map` → `/viewer`

phase: 2
layer: pages
depends_on: phase-01 (без 200 на public-ручке страница откроется в 401-редирект)
design: ../README.md

## Goal

Сделать страницу `/viewer` достижимой по клику «ДВФУ» на главной. Это единственная и одностроковая правка.

## Context

После Phase 1 бэкенд готов отдавать публичную иерархию. Сейчас [PublicHomePage.tsx:117](frontend/src/pages/PublicHomePage.tsx:117) делает `navigate('/map')`, но в [App.tsx:20+](frontend/src/App.tsx:20) зарегистрирован `/viewer` — клик уводит в fallback `/`.

Per ADR-4: правим источник (PublicHomePage), не плодим alias.

## Files to Modify

### `frontend/src/pages/PublicHomePage.tsx`

**Что меняем:** строка ~117 — `onClick={() => navigate('/map')}` → `onClick={() => navigate('/viewer')}`.

Проверить, что в файле больше нет других `navigate('/map')` — если есть, тоже поправить.

## Verification

- [ ] `tsc --noEmit` (или `npm run typecheck`) — clean
- [ ] `npm run dev` + открыть `http://localhost:5173/` (или порт проекта) → кликнуть в поле поиска → увидеть «ДВФУ» → клик → URL стал `/viewer`, страница `FloorViewerPage` отрисовалась
- [ ] Network DevTools: `GET /api/v1/buildings?published=true` вернул 200 без `Authorization` (валидирует Phase 1 + 2 вместе)
- [ ] Логин/регистрация/админка по-прежнему доступны и работают (нет регресса в App.tsx)
