# Testing Strategy: Building Hierarchy

## Test Rules

Согласно [prompts/testing.md](../../../prompts/testing.md):
- AAA-паттерн (Arrange/Act/Assert)
- Имена: `test_{что}_{условие}_{ожидаемый_результат}`
- Service-тесты мокают репозитории
- API-тесты — TestClient + in-memory SQLite
- Repository-тесты — реальная in-memory SQLite, фикстура `db_session`
- В этой фиче нет CV/processing — тестов на `processing/` не появляется

## Test Structure

```
backend/tests/
├── conftest.py                           (existing)
├── repositories/
│   ├── conftest.py                       (factories: building, floor, section)
│   ├── test_building_repo.py
│   ├── test_floor_repo.py
│   ├── test_section_repo.py
│   └── test_reconstruction_repo_extensions.py
├── services/
│   ├── test_building_service.py
│   ├── test_floor_service.py
│   ├── test_section_service.py
│   └── test_floor_schema_service.py     (NEW — wall extraction integration)
├── processing/
│   └── test_floor_schema_walls.py       (NEW — CV pipeline integration tests)
└── api/
    ├── test_buildings_api.py
    ├── test_floors_api.py
    ├── test_sections_api.py
    ├── test_floor_schema_api.py         (NEW — schema upload + extract-walls + walls)
    └── test_reconstruction_save_api.py

frontend/src/
├── hooks/
│   ├── useFloorViewer.test.ts
│   ├── useFloorSections.test.ts
│   └── useFloorEditorWizard.test.ts     (NEW — state machine wizard)
└── components/
    └── FloorEditor/
        ├── Step2CropRotate.test.tsx     (NEW)
        ├── Step3WallExtraction.test.tsx (NEW)
        ├── Step4MarkSections.test.tsx   (NEW)
        ├── Step5BindPlans.test.tsx      (NEW)
        ├── PlanGalleryPicker.test.tsx   (NEW)
        ├── SectionContextMenu.test.tsx  (NEW)
        ├── FloorSectionsTable.test.tsx  (NEW)
        └── NewSectionDialog.test.tsx    (NEW — заменяет SectionGeometryEditor.test.tsx)
```

## Coverage Mapping

### Repository Coverage

| Метод | Сценарий | Test Name |
|-------|----------|-----------|
| `BuildingRepo.get_by_code(code)` | Корпус есть | test_building_repo_get_by_code_returns_entity |
| `BuildingRepo.get_by_code(code)` | Корпуса нет | test_building_repo_get_by_code_missing_returns_none |
| `BuildingRepo.get_by_code(code)` | Регистронезависимость | test_building_repo_get_by_code_lowercase_returns_entity |
| `BuildingRepo.create(...)` | Уникальность code на DB-уровне | test_building_repo_create_duplicate_code_raises_integrity_error |
| `FloorRepo.get_by_building_and_number()` | Этаж есть | test_floor_repo_get_by_building_and_number_returns_entity |
| `FloorRepo.get_by_building_and_number()` | Этажа нет | test_floor_repo_get_by_building_and_number_missing_returns_none |
| `FloorRepo.list_by_building(id)` | Сортировка по номеру | test_floor_repo_list_by_building_returns_sorted_by_number |
| `SectionRepo.list_by_floor(id)` | Возврат с join'ом reconstruction | test_section_repo_list_by_floor_includes_reconstructions |
| `SectionRepo.delete_all_for_floor(id)` | Не трогает другие этажи | test_section_repo_delete_all_for_floor_keeps_other_floors |
| `SectionRepo.bulk_create(items)` | Массовая вставка в одной транзакции | test_section_repo_bulk_create_inserts_all |
| `ReconstructionRepo.list_unbound_for_floor(id)` | Только висящие | test_reconstruction_repo_list_unbound_returns_only_unbound |
| `ReconstructionRepo.list_unbound_for_floor(id)` | Все привязаны | test_reconstruction_repo_list_unbound_returns_empty |

### Service Coverage

| Метод | Сценарий | Test Name |
|-------|----------|-----------|
| `BuildingService.create_building` | Happy path | test_create_building_valid_data_succeeds |
| `BuildingService.create_building` | Дубль code | test_create_building_duplicate_code_raises_conflict |
| `BuildingService.create_building` | Нормализация регистра | test_create_building_lowercase_code_normalized_to_upper |
| `BuildingService.list_published` | Корпус с заполненным этажом виден | test_list_published_includes_complete_building |
| `BuildingService.list_published` | Пустой корпус скрыт | test_list_published_excludes_empty_building |
| `BuildingService.list_published` | Этаж без секций исключён из payload | test_list_published_excludes_floor_without_sections |
| `BuildingService.list_published` | Секция без reconstruction.status=Done исключена | test_list_published_excludes_section_with_pending_reconstruction |
| `ReconstructionService.list_unbound` | Только status=Done попадают в список висящих | test_list_unbound_excludes_non_done_reconstructions |
| `ReconstructionService.list_for_gallery` | Возвращает все Done реконструкции (не только этого этажа) | test_list_for_gallery_returns_all_done_across_floors |
| `ReconstructionService.list_for_gallery` | Фильтр по building_code | test_list_for_gallery_filter_by_building |
| `ReconstructionService.list_for_gallery` | Фильтр по floor_id (после building) | test_list_for_gallery_filter_by_floor |
| `FloorSchemaService.upload_schema` | Привязывает uploaded_file_id к Floor | test_upload_schema_sets_image_id |
| `FloorSchemaService.update_crop` | Обновляет schema_crop_bbox | test_update_crop_persists_bbox |
| `FloorSchemaService.extract_walls` | Вызывает CV pipeline и сохраняет результат | test_extract_walls_calls_cv_and_saves_polygons |
| `FloorSchemaService.extract_walls` | schema_image_id=None → 422 | test_extract_walls_no_image_raises_validation |
| `FloorSchemaService.update_walls` | Принимает ручной массив, сохраняет | test_update_walls_persists_manual_polygons |
| `SectionService.replace_sections` | Допускается reconstruction_id с floor_id ≠ floor_id (ADR-30) | test_replace_sections_allows_cross_floor_reconstruction |
| `FloorService.create_floor` | Building отсутствует | test_create_floor_missing_building_raises_not_found |
| `FloorService.create_floor` | Дубль номера | test_create_floor_duplicate_number_raises_conflict |
| `SectionService.replace_sections` | Happy path | test_replace_sections_valid_payload_writes_all |
| `SectionService.replace_sections` | Дубль number в payload | test_replace_sections_duplicate_number_raises_validation |
| ~~`SectionService.replace_sections` reconstruction не принадлежит floor~~ | ~~test_replace_sections_foreign_reconstruction_raises_validation~~ | **УДАЛЕНО (ADR-30):** допустим reconstruction любого этажа |
| `SectionService.replace_sections` | Reconstruction уже в payload | test_replace_sections_duplicate_reconstruction_raises_validation |
| `SectionService.replace_sections` | floor_id не существует | test_replace_sections_missing_floor_raises_not_found |
| `SectionService.replace_sections` | Транзакционный откат | test_replace_sections_transactional_rollback_on_error |
| `SectionService.replace_sections` | Пустой массив | test_replace_sections_empty_payload_clears_all |

### API Endpoint Coverage

| Endpoint | Status | Test Name |
|----------|--------|-----------|
| `POST /api/v1/buildings` | 201 | test_create_building_valid_returns_201 |
| `POST /api/v1/buildings` | 409 | test_create_building_duplicate_code_returns_409 |
| `POST /api/v1/buildings` | 422 | test_create_building_invalid_code_returns_422 |
| `POST /api/v1/buildings` | 403 | test_create_building_non_admin_returns_403 |
| `GET /api/v1/buildings` | 200 | test_list_buildings_admin_returns_all |
| `GET /api/v1/buildings?published=true` | 200 | test_list_buildings_published_filter_returns_only_complete |
| `GET /api/v1/buildings?published=true` | 200 | test_list_buildings_published_no_auth_required |
| `GET /api/v1/buildings/{id}` | 200 | test_get_building_returns_full_payload |
| `GET /api/v1/buildings/{id}` | 404 | test_get_building_missing_returns_404 |
| `PATCH /api/v1/buildings/{id}` | 200 | test_patch_building_name_returns_updated |
| `PATCH /api/v1/buildings/{id}` | 422 | test_patch_building_code_field_rejected |
| `DELETE /api/v1/buildings/{id}` | 204 | test_delete_building_cascades_to_floors_and_sections |
| `GET /api/v1/buildings/{id}/floors` | 200 | test_list_floors_returns_sorted_by_number |
| `GET /api/v1/buildings/{id}/floors` | 404 | test_list_floors_missing_building_returns_404 |
| `GET /api/v1/floors/{id}` | 200 | test_get_floor_returns_with_building |
| `GET /api/v1/floors/{id}` | 404 | test_get_floor_missing_returns_404 |
| `DELETE /api/v1/floors/{id}` | 204 | test_delete_floor_cascades_to_sections |
| `DELETE /api/v1/sections/{id}` | 204 | test_delete_section_keeps_reconstruction_unbound |
| `POST /api/v1/buildings/{id}/floors` | 201 | test_create_floor_valid_returns_201 |
| `POST /api/v1/buildings/{id}/floors` | 404 | test_create_floor_missing_building_returns_404 |
| `POST /api/v1/buildings/{id}/floors` | 409 | test_create_floor_duplicate_number_returns_409 |
| `GET /api/v1/floors/{id}/sections` | 200 | test_list_sections_returns_all_with_reconstructions |
| `PUT /api/v1/floors/{id}/sections` | 200 | test_replace_sections_valid_returns_200 |
| `PUT /api/v1/floors/{id}/sections` | 422 | test_replace_sections_duplicate_number_returns_422 |
| ~~`PUT /api/v1/floors/{id}/sections` foreign reconstruction~~ | ~~422~~ | **УДАЛЕНО (ADR-30):** допустим |
| `PUT /api/v1/floors/{id}/sections` | 404 | test_replace_sections_missing_floor_returns_404 |
| `PUT /api/v1/floors/{id}/sections` | 422 | test_replace_sections_reconstruction_already_used_returns_422 (всё ещё проверяем UNIQUE) |
| `PUT /api/v1/floors/{id}/schema` | 200 | test_upload_floor_schema_returns_200 |
| `PUT /api/v1/floors/{id}/schema` | 404 | test_upload_floor_schema_missing_floor_returns_404 |
| `PUT /api/v1/floors/{id}/schema` | 422 | test_upload_floor_schema_invalid_image_id_returns_422 |
| `POST /api/v1/floors/{id}/extract-walls` | 200 | test_extract_walls_returns_polygons |
| `POST /api/v1/floors/{id}/extract-walls` | 422 | test_extract_walls_no_schema_returns_422 |
| `POST /api/v1/floors/{id}/extract-walls` | 404 | test_extract_walls_missing_floor_returns_404 |
| `PUT /api/v1/floors/{id}/walls` | 200 | test_update_walls_manual_returns_200 |
| `PUT /api/v1/floors/{id}/walls` | 404 | test_update_walls_missing_floor_returns_404 |
| `PATCH /reconstruction/reconstructions/{id}` | 200 | test_patch_reconstruction_floor_id_returns_200 |
| `PATCH /reconstruction/reconstructions/{id}` | 404 | test_patch_reconstruction_missing_floor_returns_404 |
| `PUT /reconstruction/reconstructions/{id}/save` | 200 | test_save_reconstruction_with_floor_id_returns_200 |
| `PUT /reconstruction/reconstructions/{id}/save` | 404 | test_save_reconstruction_missing_floor_id_returns_404 |
| `PUT /reconstruction/reconstructions/{id}/save` | 422 | test_save_reconstruction_no_floor_id_returns_422 |
| `GET /reconstruction/reconstructions?floor_id=X&unbound=true` | 200 | test_list_reconstructions_unbound_filter_returns_only_unbound |
| `GET /reconstruction/reconstructions/{id}` | 200 | test_get_reconstruction_includes_floor_and_section_info |

### Frontend Coverage

| Хук/Компонент | Сценарий | Test Name |
|---------------|----------|-----------|
| `useFloorSections` | Replace-стратегия отправляет весь массив | test_useFloorSections_save_sends_full_array |
| `useFloorSections` | Локальная валидация дубля номера | test_useFloorSections_addSection_duplicate_number_returns_error |
| `useFloorViewer` | Маппинг segment→section по reconstructionId | test_useFloorViewer_segment_to_section_mapping |
| `useFloorViewer` | Скрытие корпусов без published секций | test_useFloorViewer_published_filter_hides_empty |
| `useFloorEditorWizard` | currentStep=1 если schema_image_id=null | test_useFloorEditorWizard_starts_at_step_1_for_empty_floor |
| `useFloorEditorWizard` | currentStep=Overview если данные уже есть | test_useFloorEditorWizard_starts_at_overview_when_filled |
| `useFloorEditorWizard` | nextStep инкрементирует currentStep | test_useFloorEditorWizard_next_step_advances |
| `useFloorEditorWizard` | save в saveAll отправляет drafts через PUT sections | test_useFloorEditorWizard_save_all_sends_replace |
| `useRouteTest` (adapt) | Метки строятся из иерархии | test_useRouteTest_displayLabel_uses_hierarchy |
| `useRouteTest` (adapt) | Без floor_id игнорируются | test_useRouteTest_filters_reconstructions_without_floor |
| `Step2CropRotate` | Drag handle меняет crop_bbox | test_step2_drag_handle_updates_bbox |
| `Step2CropRotate` | Кнопка Rotate увеличивает rotation на 90 | test_step2_rotate_button_adds_90 |
| `Step3WallExtraction` | Mount триггерит extract-walls если wall_polygons null | test_step3_calls_extract_walls_on_mount |
| `Step3WallExtraction` | "Очистить всё" с confirm обнуляет полигоны | test_step3_clear_all_resets_polygons |
| `Step4MarkSections` | Drag прямоугольника открывает NewSectionDialog | test_step4_rect_drag_opens_dialog |
| `Step4MarkSections` | Default номер = max+1 | test_step4_default_number_is_max_plus_one |
| `NewSectionDialog` | Apply emits корректный payload | test_new_section_dialog_apply_emits_payload |
| `NewSectionDialog` | Дубль номера inline error | test_new_section_dialog_duplicate_number_inline_error |
| `PlanGalleryPicker` | Поиск фильтрует карточки | test_plan_gallery_search_filters_cards |
| `PlanGalleryPicker` | Dropdown Здание disable Этаж до выбора | test_plan_gallery_floor_disabled_until_building |
| `PlanGalleryPicker` | Default «Все здания» возвращает всё | test_plan_gallery_all_buildings_returns_all |
| `PlanGalleryPicker` | Click карточки emit'ит bind | test_plan_gallery_click_emits_bind |
| `SectionContextMenu` | Click "Изменить номер" открывает NewSectionDialog | test_context_menu_change_number_opens_dialog |
| `SectionContextMenu` | Click "Удалить отсек" вызывает confirm + onDelete | test_context_menu_delete_calls_confirm_and_delete |
| `FloorSectionsTable` | Render строк с правильным статусом | test_table_renders_status_correctly |
| `FloorSectionsTable` | Click "Редактировать схему" → Wizard step 1 | test_table_edit_schema_navigates_to_wizard |

### Migration Coverage

| Test | Описание |
|------|----------|
| test_migration_drops_old_reconstructions_columns | Reconstruction не имеет building_id (str), floor_number (int) |
| test_migration_creates_section_table_with_constraints | UNIQUE(floor_id, number); UNIQUE(reconstruction_id) |
| test_migration_drops_floor_reconstruction_id | Колонка `floors.reconstruction_id` отсутствует |
| test_migration_adds_building_code_unique | UNIQUE constraint на `buildings.code` |
| test_migration_drops_floor_transitions | Все floor_transitions удалены до drop reconstructions |

## Test Count Summary

| Layer | Tests |
|-------|-------|
| Repository | 12 |
| Service | 26 |
| API | 41 |
| Migration | 5 |
| Frontend hooks | 11 |
| Frontend components | 16 |
| Processing (CV integration) | 3 |
| **TOTAL** | **114** |

## Test Data Fixtures (sketch)

```python
# backend/tests/repositories/conftest.py
@pytest.fixture
async def building_factory(db_session):
    async def _factory(code="D", name="Корпус D", **overrides):
        b = Building(code=code, name=name, **overrides)
        db_session.add(b); await db_session.flush()
        return b
    return _factory

@pytest.fixture
async def floor_factory(db_session, building_factory):
    async def _factory(building=None, number=1, **overrides):
        b = building or await building_factory()
        f = Floor(building_id=b.id, number=number, **overrides)
        db_session.add(f); await db_session.flush()
        return f
    return _factory

@pytest.fixture
async def section_factory(db_session, floor_factory):
    async def _factory(floor=None, number=1, geometry=None, reconstruction_id=None):
        f = floor or await floor_factory()
        geom = geometry or {"type": "rect", "points": [[0.1, 0.1], [0.5, 0.5]]}
        s = Section(floor_id=f.id, number=number, geometry=geom, reconstruction_id=reconstruction_id)
        db_session.add(s); await db_session.flush()
        return s
    return _factory
```

## Manual Test Plan (smoke before merge)

1. Создать корпус D, этажи 6/7/8 в `/admin/buildings`
2. Загрузить три плана через визард: D/7, D/7, D/8 (без привязки к секции)
3. В `/admin/floor-editor` выбрать D/7:
   - Шаг 1: загрузить фото-схему этажа (PNG); кнопка «Далее» становится активной
   - Шаг 2: orange handles → выделить чистую область схемы; «Поворот» работает
   - Шаг 3: автомат CV отрабатывает (несколько секунд spinner) → видны полигоны стен; «Очистить всё» с confirm; ручная правка инструментом «Выделение стен»
   - Шаг 4: drag прямоугольника → модалка «Новый отсек» с default «1» → Применить; повторить для отсека 2
   - Шаг 5: слева список отсеков, справа галерея с фильтрами; выбрать «Здание D» → «Этаж 7» → видны только D7-планы; кликнуть план для отсека 1, потом план для отсека 2; «Сохранить»
4. После save — Overview view: видна схема с двумя нейтрально-окрашенными отсеками; клик по отсеку → подсветка orange + список слева
5. Right-click на отсек → «Изменить номер» (модалка) меняет номер; «Удалить отсек» с confirm удаляет
6. «Сохранить изменения» — toast «Сохранено»
7. Переключиться в табличный вид — видна таблица с номерами, планами, статусом «Привязан/Не привязан»
8. В `/admin/edit/{id}` для каждого привязанного плана — плашка "Привязан к отсеку №N (Корпус D, этаж 7)"
9. End-user `/viewer` — выбрать D → видны только этаж 7, переключить отсек → 3D меняется + мини-карта показывает фото-схему + стены + оранжевую активную секцию
10. Удалить корпус D — все этажи, секции, schema_image_id исчезают; реконструкции остаются с `floor_id=NULL`
