# Design Decisions: Refactor Core

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Как внедрять сервисы в роутеры | FastAPI `Depends()` через `api/deps.py` | Singleton на уровне модуля (текущий паттерн) | `Depends()` позволяет тестировать роутеры с mock-сервисами без Singleton. Текущий `reconstruction_service = ReconstructionService()` в `processing/reconstruction_service.py:201` невозможно заменить в тестах. |
| 2 | Сервисы: классы или модули с функциями | Классы с `__init__` (получают repo/upload_dir через конструктор) | Модули с функциями (передавать всё через параметры) | Классы лучше компонуются через DI. Репозиторий — это состояние (session), его удобнее инжектировать в конструктор, а не в каждый метод. |
| 3 | Репозитории: один класс или несколько | Один `ReconstructionRepository` для `Reconstruction` + `UploadedFile` | По одному классу на каждую ORM-модель | В текущей кодовой базе `UploadedFile` и `Reconstruction` всегда используются вместе (см. `api/upload.py:70-90`, `processing/reconstruction_service.py:56-68`). Объединение минимизирует количество новых файлов в MVP. |
| 4 | Чистые функции vs чистые классы в `processing/` | Модуль-уровневые функции (`def preprocess_image(...)`) | Классы без состояния | Функции проще тестировать, не нужен `__init__`. Текущий `BinarizationService` — класс без значимого состояния, что избыточно. |
| 5 | `processing/mesh_generator.py` — что с ним делать | Извлечь чистую логику в `processing/mesh_builder.py`, оригинал оставить (deprecated) | Переименовать in-place | Сохранение `mesh_generator.py` предотвращает поломку до полной замены. Новый `mesh_builder.py` — целевой паттерн. После рефакторинга `mesh_generator.py` можно удалить. |
| 6 | `BinarizationService` и `ContourService` | Не трогать — они disconnected | Рефакторировать их тоже | Тикет явно запрещает: "НЕ подключать BinarizationService и ContourService к пайплайну". Они станут `processing/vectorizer.py` в отдельной фиче `vectorization-pipeline`. |
| 7 | `logging` vs `core/img_logging.py` | Использовать стандартный `logging.getLogger(__name__)` | Оставить `core/img_logging.py` | `core/logging_config.py` уже существует. `img_logging.py` — custom wrapper, нарушает принцип стандартизации. Замена всех `print()` на `logging` — AC #6. |
| 8 | `models/domain.py` — минимальный состав | `FloorPlan`, `Wall`, `Point2D`, `VectorizationResult` | Только то, что нужно для pipeline | Соответствует AC #5 тикета и `prompts/architecture.md:81-113`. `VectorizationResult` нужен как выход `vectorizer.py`. |
| 9 | API-контракт | Не меняется ни один endpoint, ни одно поле | Можно улучшить (напр. добавить `created_at` в `ReconstructionListItem`) | Тикет явно: "НЕ менять API контракты (фронтенд не должен ломаться)". Баг с пустым `ReconstructionListItem` (в `models/reconstruction.py:100-103` нет `mesh_url` и `created_at`) фиксируется без изменения имени полей. |
| 10 | Стратегия миграции | Постепенная: создать новые файлы → обновить импорты → удалить старые | Big bang (всё сразу) | Постепенная безопаснее — можно проверить каждый шаг. Pipeline проверяется интеграционным тестом после каждой фазы. |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Поломка рабочего pipeline (upload → mask → 3D) при рефакторинге | High | Интеграционный тест на весь pipeline добавляется в Phase 1. Запускается после каждой фазы. |
| `mesh_generator.py` сложно разбить без перетестирования алгоритма | Med | `processing/mesh_builder.py` — тонкая обёртка над существующей логикой. Алгоритм не переписывается, только удаляется file I/O из конструктора. |
| Singleton `reconstruction_service` импортируется напрямую в 4 функциях `api/reconstruction.py` | Med | Заменить все 4 импорта на `Depends(get_reconstruction_service)` в одной фазе (Phase 5). |
| SQLAlchemy session lifecycle — передача `AsyncSession` через `Depends` вместо `async_session_maker()` | Med | `api/deps.py` будет использовать `get_db()` dependency как в `prompts/python_style.md`. Репозиторий получает session через конструктор. |
| `upload.py:70-90` — `save_file_to_db()` прямо в роутере использует `async_session_maker` | Low | Перенести в `UploadRepository` в той же фазе, что и `ReconstructionRepository`. |
| flake8 может найти нарушения в старом коде (не нашем) | Low | Запускать только на новых/изменённых файлах. AC #10 формулирует `flake8 app/` — проверить текущий baseline и при необходимости добавить `# noqa` там где необходимо. |

---

## Open Questions

- [x] Нужно ли создавать `services/upload_service.py` или логику загрузки файла оставить в роутере? — **Да, создать**: `api/upload.py` сейчас содержит `save_file_to_db()` напрямую с `async_session_maker`, что нарушает AC #3.
- [x] `processing/navigation.py` — делать ли его чистой функцией сейчас? — **Да, минимально**: `NavigationGraphService.a_star()` уже почти чист (нет DB, нет file I/O). Нужно только вынести `a_star` как top-level функцию и добавить тест.
- [x] `ReconstructionListItem` в `models/reconstruction.py:100-103` не имеет полей `mesh_url` и `created_at`, но роутер их передаёт — это баг? — **Да, баг в текущем коде**. Pydantic v2 молча игнорирует лишние поля. Исправить `ReconstructionListItem` добавив `Optional[str]` и `datetime` без изменения имён — это не breaking change.
- [ ] Нужна ли миграция Alembic для каких-либо изменений схемы? — **Нет**: ORM модели не меняются, схема БД остаётся прежней.
