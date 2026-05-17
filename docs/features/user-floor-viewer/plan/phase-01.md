# Phase 1: Backend — публичный доступ + тесты

phase: 1
layer: api + tests
depends_on: none
design: ../README.md

## Goal

Сделать `GET /api/v1/buildings?published=true` доступным без авторизации, при этом сохранить 401 для admin-режима (`published=false`). Покрыть оба режима регресс-тестами. Это разблокирует фронт.

## Context

Сейчас [buildings_hierarchy.py:42-55](backend/app/api/buildings_hierarchy.py:42) использует `Depends(HTTPBearer())`, который выкидывает 401 при отсутствии заголовка независимо от значения параметра `published`. Решение — ADR-1 в [../03-decisions.md](../03-decisions.md): `HTTPBearer(auto_error=False)`, ветвление внутри хендлера.

`POST /api/v1/navigation/multifloor-route` уже публичен ([navigation.py:19-24](backend/app/api/navigation.py:19)), но добавляем регресс-тест, чтобы случайно не повесили auth обратно.

## Files to Modify

### `backend/app/api/buildings_hierarchy.py`

**Что меняем (только функция `list_buildings`, строки ~42-55):**

1. Заменить `security = HTTPBearer()` на module-level `security = HTTPBearer(auto_error=False)` (или ввести второй экземпляр `optional_security` — но проще одну глобальную, она используется только в этом файле; админские ручки ниже всё равно валидируют credentials через бизнес-логику).
   - **Важно:** проверить, что другие хендлеры в этом файле (`create_building`, `get_building`, `update_building`, `delete_building`) после смены `auto_error=False` всё ещё корректно возвращают 401 — нужно добавить **явную проверку** `if credentials is None: raise HTTPException(401)` в начале каждого admin-хендлера. Альтернатива: завести два экземпляра — `security` (обязательный для admin) и `optional_security` (для `list_buildings`).
   - **Рекомендуется** второй вариант (два экземпляра, минимум рисков для admin-ручек).

2. В `list_buildings`: сменить `credentials: HTTPAuthorizationCredentials = Depends(security)` на `credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security)`.

3. Логика:
   ```python
   if published:
       return await svc.list_published()  # auth не валидируем
   if credentials is None:
       raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
   return await svc.list_admin()
   ```

**Ничего больше в этом файле не трогаем.** Контракт ответа не меняется (см. [../05-api-contract.md](../05-api-contract.md)).

## Files to Create

### `backend/tests/api/test_buildings_hierarchy_api.py`

**Тесты из [04-testing.md §Backend API](../04-testing.md):**

- `test_list_buildings_published_no_auth_returns_200`
- `test_list_buildings_published_invalid_token_returns_200`
- `test_list_buildings_published_valid_token_returns_200_same_body`
- `test_list_buildings_admin_no_auth_returns_401`
- `test_list_buildings_default_no_auth_returns_401`
- `test_list_buildings_admin_valid_token_returns_200`
- `test_multifloor_route_no_auth_returns_200`

**Структура:** pytest + httpx `AsyncClient` + фикстуры из существующих conftest (если есть; иначе минимальный conftest с TestClient — посмотреть, как сделано в [backend/tests/](backend/tests/) в соседних `test_*_api.py`). Использовать существующие фикстуры зданий/реконструкций, если они есть; иначе создать минимальные данные через прямые INSERT в тестовой in-memory SQLite.

AAA-структура, имена соблюдаются. Один логический assert на тест.

### `backend/tests/services/test_building_service_published.py`

- `test_list_published_excludes_building_without_done_reconstruction`
- `test_list_published_returns_building_with_done_section`
- `test_list_published_response_omits_private_fields` — проверить, что в `PublicBuilding` не утекает `Building.address` или иные приватные поля.

Сервис тестируем напрямую с мок/in-memory репозиторием.

## Verification

- [ ] `python -m py_compile backend/app/api/buildings_hierarchy.py` — passes
- [ ] `python -m pytest backend/tests/api/test_buildings_hierarchy_api.py backend/tests/services/test_building_service_published.py -v` — все 10 тестов зелёные
- [ ] Существующие тесты в `backend/tests/api/` (если есть на админскую часть buildings_hierarchy) продолжают проходить
- [ ] `python -m flake8 backend/app/api/buildings_hierarchy.py` — clean
- [ ] Manual: запустить uvicorn, `curl -i http://localhost:8000/api/v1/buildings?published=true` → 200; `curl -i http://localhost:8000/api/v1/buildings` → 401
