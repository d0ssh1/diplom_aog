# Text & Color Removal — Design

date: 2026-03-14
status: draft
research: ../../research/text-removal.md, ../../research/text-removal-patterns.md

## Business Context

Планы эвакуации содержат цветные элементы (зелёные стрелки путей эвакуации, красные символы огнетушителей/пожарных кранов) и текст (номера кабинетов, подписи). После перехода на адаптивную бинаризацию все эти элементы стали хорошо видны в маске — они создают ложные контуры при векторизации, портят детекцию стен и комнат.

Фича интегрирует существующие (но отключённые) функции `color_filter`, `text_detect`, `remove_text_regions` из `pipeline.py` в пайплайн маски (`MaskService.calculate_mask`), с улучшениями:
- Раздельная фильтрация зелёного и красного каналов (вместо общего saturation threshold)
- Морфологическое восстановление стен после удаления цветных элементов
- Сохранение текстовых блоков для последующего назначения номеров комнат

## Acceptance Criteria

1. Зелёные стрелки (пути эвакуации) удаляются из маски без разрывов стен
2. Красные символы (огнетушители, пожарные краны) удаляются; стены под ними восстанавливаются морфологически
3. Текст и числа удаляются из бинарной маски через OCR + inpaint
4. Текстовые блоки (включая номера кабинетов) сохраняются в JSON для использования при векторизации
5. Шаги включены по умолчанию, но могут быть отключены через параметры `MaskService.calculate_mask`
6. Все новые функции покрыты тестами (≥2 теста на функцию)
7. Время обработки: color removal < 1s, text removal < 5s на изображении 3000×2000

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | C4 L1+L2+L3, module dependencies |
| 02-behavior.md | Process | Data flow + sequence diagrams |
| 03-decisions.md | Decision | Design decisions, risks, open questions |
| 04-testing.md | Quality | Test strategy + coverage mapping |
| 06-pipeline-spec.md | Pipeline | Processing pipeline details (CV algorithms) |
| plan/ | Code | Phase-by-phase implementation plan |
