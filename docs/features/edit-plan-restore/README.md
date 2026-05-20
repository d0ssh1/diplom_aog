# edit-plan-restore — Design

date: 2026-04-04
status: draft
research: ../../research/edit-plan-restore.md

## Business Context
Редактирование плана должно открывать уже размеченные помещения и двери без потери формы и размеров. Сейчас при повторном открытии экрана редактирования часть комнат отображается как большие оранжевые прямоугольники, хотя исходные данные содержат более точную геометрию. Это ломает доверие к редактору и может привести к повторному сохранению упрощённой геометрии вместо исходной.

Задача — сохранить и восстановить геометрию помещений end-to-end в рамках текущего edit-plan flow, чтобы визуализация на экране редактирования соответствовала сохранённым данным.

## Acceptance Criteria
1. При повторном открытии экрана редактирования все ранее сохранённые помещения отображаются в тех же координатах и с той же формой, которая была сохранена в vectorization data.
2. После открытия и сохранения без изменений геометрия помещений не деградирует до упрощённых оранжевых прямоугольников.
3. Фронтенд и бэкенд используют согласованную схему rooms/polygon/center без потери данных при загрузке и сохранении.

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | C4 L1+L2+L3, module dependencies |
| 02-behavior.md | Process | Data flow + sequence diagrams |
| 03-decisions.md | Decision | Design decisions, risks, open questions |
| 04-testing.md | Quality | Test strategy + coverage mapping |
| 05-api-contract.md | API | HTTP API contract |

## Design Notes
- This is a bugfix in the existing edit-plan flow, not a new capability.
- The primary concern is data fidelity across restore/save boundaries.
- No image-processing pipeline changes are required; the issue is in how stored vector data is interpreted and rendered.
