Откати mask_service.py к версии ДО тикета improve-vectorization.
Удали шаги: connected components cleanup, text-like filtering, MORPH_OPEN.
Оставь ТОЛЬКО:
1. rotate
2. remove_colored_elements (с расширенными HSV диапазонами — это ок)
3. crop
4. adaptive threshold
5. MORPH_CLOSE (1 iteration)
6. text detect + text removal
7. save

НЕ добавляй фильтрацию по площади connected components.
НЕ добавляй фильтрацию по aspect ratio.
НЕ добавляй MORPH_OPEN.

Стены на планах ДВФУ очень тонкие (3-5 пикселей).
Любая фильтрация по площади удаляет их вместе с мусором.