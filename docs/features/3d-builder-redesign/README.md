# 3D Builder Redesign — Design

date: 2026-03-19
status: draft
research: ../../research/3d-builder-redesign.md
ticket: tickets/new_tickets/03-new-3d-design.md

## Business Context

Текущая 3D-модель этажа выглядит как технический прототип: однотонные серые стены (#9E9E9E),
без пола в меше, без визуальных акцентов. Для ВКР нужен профессиональный вид, сопоставимый
с 2ГИС Indoor Maps, но с фирменной стилизацией Diplom3D (кибер-брутализм, акцент #FF4500).

Изменения затрагивают два слоя: бэкенд (генерация геометрии — добавить пол и крышки стен
с vertex colors) и фронтенд (освещение, тени, материалы — использовать vertex colors из GLB
вместо перезаписи единым серым).

## Acceptance Criteria

1. Пол виден в 3D-сцене — серый прямоугольник (#B8B5AD) под стенами
2. Бока стен тёмно-серые (#4A4A4A), крышки стен оранжевые (#FF4500)
3. Мягкие тени от стен на пол (directional light + receiveShadow на полу)
4. Vertex colors из GLB используются фронтендом (не перезаписываются)
5. NavigationPath и RoutePanel работают без изменений
6. `pytest` и `npx tsc --noEmit` проходят без ошибок

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | C4 L2+L3, зависимости модулей |
| 02-behavior.md | Process | Поток данных + sequence |
| 03-decisions.md | Decision | Архитектурные решения, риски |
| 04-testing.md | Quality | Стратегия тестирования |
| plan/ | Code | Пофазовый план реализации |
