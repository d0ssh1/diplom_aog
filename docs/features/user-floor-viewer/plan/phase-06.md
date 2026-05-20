# Phase 6: UX-валидация ввода + sanity-скрипт данных ДВФУ

phase: 6
layer: hooks + scripts
depends_on: phase-05
design: ../03-decisions.md (ADR-3 фаза 1, ADR-5)

## Goal

1. ADR-3 фаза 1: Объяснить пользователю формат полей маршрута («D304») через helper text и валидацию regex. Combobox-автокомплит — OUT OF SCOPE.
2. ADR-5: Скрипт `scripts/check_dvfu_published.py` для проверки наличия опубликованного ДВФУ в БД. Документация в README по ручному посеву, если данных нет.

## Context

После Phase 5 фича функционально готова. Осталось два штриха:
- Сейчас если пользователь введёт «kek» в поле маршрута, он получит непонятный 404 от бэка. Хотим перехватить локально с понятным сообщением и подсказкой формата.
- На демо ВКР важно, чтобы у ДВФУ был хотя бы один готовый отсек, иначе клик «ДВФУ» приведёт на страницу с пустым каталогом или без 3D-модели.

## Files to Modify

### `frontend/src/hooks/useFloorViewer.ts`

**Что добавляем (минимально):**

1. Константа в модуле: `const ROOM_REF_RE = /^[A-Za-zА-Яа-я]+\d+$/;` (буквы корпуса + цифры комнаты).
2. В функции `planRoute(start, end)`:
   - Trim входов.
   - Если `!ROOM_REF_RE.test(start)` или `!ROOM_REF_RE.test(end)` — `setRouteError('Формат: код корпуса + номер комнаты, например D304')` и return до HTTP-вызова.
   - Остальная логика без изменений.
3. Существующий вызов `setRouteError(...)` при «разные корпуса» оставляем.

### `frontend/src/components/FloorViewer/RouteInputs.tsx`

Добавить под полями (но над кнопкой Submit) helper-text:

```tsx
<div className={styles.helper}>Пример: D304</div>
```

Стиль `.helper`: 11px/400/`#888`, margin-top:2px.

## Files to Create

### `scripts/check_dvfu_published.py`

Самодостаточный скрипт (запускается из корня проекта). Подключается к dev-SQLite через те же settings, что и backend. Печатает:

```
=== Published buildings check ===
Total buildings: N
Published buildings (with ≥1 Done section):
  - id=1 code="D" name="ДВФУ корпус D" — floors: 3, published sections: 5
  - id=2 code="S" name="ДВФУ корпус S" — floors: 2, published sections: 1
Building "ДВФУ" candidates: 2 — OK
```

Если ничего не найдено — печатает чек-лист ручного посева:

```
[!] No published buildings found.
To seed data manually:
  1. Login as admin at http://localhost:5173/login
  2. Go to /admin/buildings → create building "ДВФУ корпус D" with code "D"
  3. Add floor #7, upload plan
  4. Go to /admin/floor-editor → run 5-step wizard
  5. Bind plan to a reconstruction in step 5
  6. Wait for reconstruction.status == Done
  7. Re-run this script
```

**Реализация:** прямой `SQLAlchemy` запрос к `Building`/`Floor`/`Section`/`Reconstruction` через те же модели, что использует backend. Импорт через `sys.path.insert(0, 'backend')` + `from app.db.models...`. Запуск: `python scripts/check_dvfu_published.py`.

Если в проекте уже есть `scripts/` — добавить туда; если нет — создать с `__init__.py`-less структурой.

### `scripts/README.md` (если не существует)

Одна секция «check_dvfu_published.py» — что делает, как запускать.

## Verification

- [ ] `/viewer`: ввести «kek» в поле начала → клик «Построить» → inline error «Формат: код корпуса + номер комнаты, например D304», HTTP-запроса нет (DevTools Network)
- [ ] Ввести «D304» и «D712» → запрос идёт, маршрут строится (если данные есть)
- [ ] Под полями маршрута видна подсказка «Пример: D304»
- [ ] `python scripts/check_dvfu_published.py` — отрабатывает без ошибок, печатает осмысленный отчёт
- [ ] Если данных нет — чек-лист посева корректен (шаги ведут на существующие админ-страницы)
- [ ] `tsc --noEmit` clean
- [ ] Полный manual-smoke из [04-testing.md §Frontend manual smoke](../04-testing.md) — все 11 шагов ✓
- [ ] Все 7 acceptance criteria из [README §Acceptance Criteria](../README.md) и визуальные из [07-ui-spec.md §6](../07-ui-spec.md) выполнены
