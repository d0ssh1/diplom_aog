# Code Plan: Refactor Core

date: 2026-03-13
design: ../README.md
status: draft

## Phase Strategy

**Bottom-up** — создаём от внутренних слоёв к внешним, чтобы каждая фаза могла
компилироваться и проверяться независимо. Зависимости направлены строго внутрь:
`api/ → services/ → processing/ / db/repositories/`.

Каждая фаза не ломает работающий pipeline — старый код удаляется только в Phase 05,
когда новый уже работает.

## Phases

| # | Название | Слой | Depends on | Status |
|---|----------|------|------------|--------|
| 01 | Core Foundation | core/, models/ | — | ☐ |
| 02 | Processing Pure Functions | processing/ | Phase 01 | ☐ |
| 03 | Repository | db/repositories/ | Phase 01 | ☐ |
| 04 | Services | services/ | Phase 02, 03 | ☐ |
| 05 | API Layer + Cleanup | api/ | Phase 04 | ☐ |
| 06 | Tests | tests/ | Phase 05 | ☐ |

## File Map

### New Files

```
backend/app/
├── core/
│   └── exceptions.py                     ← Phase 01
├── models/
│   └── domain.py                         ← Phase 01
├── processing/
│   ├── preprocessor.py                   ← Phase 02
│   ├── vectorizer.py                     ← Phase 02
│   └── mesh_builder.py                   ← Phase 02
├── db/
│   └── repositories/
│       ├── __init__.py                   ← Phase 03
│       └── reconstruction_repo.py        ← Phase 03
├── services/
│   ├── __init__.py                       ← Phase 04
│   ├── mask_service.py                   ← Phase 04
│   └── reconstruction_service.py         ← Phase 04
└── api/
    └── deps.py                           ← Phase 05

backend/tests/
├── conftest.py                           ← Phase 06
├── test_architecture.py                  ← Phase 06
├── processing/
│   ├── conftest.py                       ← Phase 06
│   ├── test_preprocessor.py              ← Phase 06
│   ├── test_vectorizer.py                ← Phase 06
│   ├── test_mesh_builder.py              ← Phase 06
│   └── test_navigation.py               ← Phase 06
├── db/
│   └── test_reconstruction_repo.py       ← Phase 06
├── services/
│   ├── test_mask_service.py              ← Phase 06
│   └── test_reconstruction_service.py    ← Phase 06
└── api/
    ├── test_upload.py                    ← Phase 06
    └── test_reconstruction.py            ← Phase 06
```

### Modified Files

```
backend/app/
├── processing/
│   └── navigation.py          ← Phase 02: добавить top-level a_star()
├── api/
│   ├── reconstruction.py      ← Phase 05: тонкий слой, Depends, убрать status_map дублирование
│   └── upload.py              ← Phase 05: убрать save_file_to_db(), использовать repo
```

### Deleted Files (Phase 05)

```
backend/app/processing/
├── reconstruction_service.py  ← всё переехало в services/ + db/repositories/
└── mask_service.py            ← всё переехало в services/ + processing/preprocessor.py
```

> `processing/mesh_generator.py` — **не удаляется**: `mesh_builder.py` делегирует
> ему вычислительную логику. Файл остаётся как внутренняя реализация.

## Success Criteria

- [ ] Все фазы завершены и верифицированы
- [ ] `grep -r "from app.api\|from app.db\|from app.core.config" backend/app/processing/` → пусто
- [ ] `grep -r "async_session_maker\|session_maker" backend/app/api/` → пусто
- [ ] `grep -rn "print(" backend/app/` → пусто (кроме `if __name__ == "__main__"` блоков)
- [ ] `python -m pytest backend/tests/ -v` → все 36 тестов проходят
- [ ] `python -m flake8 backend/app/ --max-line-length=100` → 0 ошибок
- [ ] Ручная проверка: upload plan → calculate mask → build mesh → get reconstruction
- [ ] Все Acceptance Criteria из `../README.md` выполнены
