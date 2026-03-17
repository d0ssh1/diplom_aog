# Frontend Redesign — Design

date: 2026-03-17
status: draft
research: ../../research/frontend-redesign.md
ticket: ../../../tickets/03-frontend-redesign.md

## Business Context

Текущий фронтенд функционально работает, но визуально не соответствует утверждённым макетам Figma и имеет серьёзный архитектурный долг: `AddReconstructionPage.tsx` (400 строк) смешивает состояние wizard, вызовы API, canvas-хелперы и рендеринг в одном компоненте. Отсутствуют layout-компоненты, shared UI-примитивы, централизованные типы и кастомные хуки.

Редизайн решает две задачи одновременно: приводит визуал в соответствие с макетами (новая дизайн-система — оранжевый акцент, чёрная шапка, белый сайдбар) и устраняет архитектурный долг (выносит логику в хуки, создаёт компонентную иерархию по стандартам `prompts/frontend_style.md`).

Backend API остаётся без изменений. `apiService.ts` и `MeshViewer.tsx` сохраняются как есть.

## Acceptance Criteria

1. Все 8 экранов из Figma реализованы и визуально соответствуют макетам в `docs/design/`
2. `AddReconstructionPage.tsx` заменён на `WizardPage.tsx` + `useWizard.ts` + `useFileUpload.ts` — ни один из новых файлов не превышает 150 строк
3. Роутинг обновлён: `/` → DashboardPage, `/upload` → WizardPage, `/login` → LoginPage, `/mesh/:id` → ViewMeshPage
4. Дизайн-система применена: CSS-переменные из тикета (`--color-orange: #FF5722`, `--color-header-bg: #000000` и др.) заменяют старые переменные
5. TypeScript strict mode — ноль ошибок `tsc --noEmit`
6. Нет `any`, нет inline-стилей, нет `console.log/error` в продакшн-коде
7. `MeshViewer.tsx` и `apiService.ts` не изменены

## Documents

| Файл | Вид | Описание |
|------|-----|----------|
| 01-architecture.md | Логический | C4 L1+L2+L3, модульные зависимости |
| 02-behavior.md | Процессный | Data flow + sequence диаграммы |
| 03-decisions.md | Решения | ADR, риски, открытые вопросы |
| 04-testing.md | Качество | Стратегия тестирования |
| plan/ | Код | Пофазовый план реализации |
