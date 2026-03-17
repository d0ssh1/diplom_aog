# Testing Strategy: Frontend Redesign

## Контекст

Фронтенд не имеет тестовой инфраструктуры (нет vitest/jest, нет testing-library — research подтверждает). Добавление инфраструктуры выходит за рамки этой фичи. Тестирование — ручное + TypeScript как статический анализ.

## Статический анализ (обязательно)

Каждая фаза завершается проверкой:

```bash
# TypeScript — ноль ошибок
cd frontend && npx tsc --noEmit

# ESLint — ноль предупреждений
cd frontend && npm run lint
```

Эти проверки заменяют unit-тесты для фронтенда в данной фазе.

## Ручное тестирование по экранам

### Экран 0: Login (`/login`)
| Сценарий | Ожидаемый результат |
|----------|---------------------|
| Открыть `/login` без токена | Страница входа, без шапки/сайдбара |
| Ввести корректные логин/пароль, нажать "Войти" | Redirect на `/` |
| Ввести неверный пароль | Красная рамка на инпутах + сообщение об ошибке |
| Открыть `/` без токена | Redirect на `/login` (если реализована защита маршрутов) |

### Экран 1/2: Dashboard (`/`)
| Сценарий | Ожидаемый результат |
|----------|---------------------|
| Нет реконструкций | Правая область: иконка ×, текст "Нет загруженных планов", кнопка "Начать" |
| Есть реконструкции | Сетка карточек 3 в ряд с превью и именами |
| Клик × на карточке | DELETE запрос, карточка исчезает |
| Клик на карточку | Переход на `/mesh/:id` |
| Клик "Начать" или "Загрузить изображение" | Переход на `/upload` |

### Экран 3-7: Wizard (`/upload`)
| Сценарий | Ожидаемый результат |
|----------|---------------------|
| Открыть `/upload` | Шаг 1 активен (оранжевый кружок), drag-drop зона |
| Drag-drop файл | Файл появляется в правой панели, кнопка "Далее" активна |
| Клик "Выбрать файлы" | File picker открывается |
| Несколько файлов | Сетка превью 3×N |
| × на файле | Файл удаляется из списка |
| "Далее" → Шаг 2 | Step indicator: шаг 2 оранжевый, canvas с планом |
| Инструменты кисть/ластик | Рисование на canvas работает |
| Слайдер толщины | Размер кисти меняется |
| "Далее" → Шаг 3 | Кнопка "Построить" по центру |
| Клик "Построить" | Спиннер, затем переход к шагу 4 |
| Шаг 4 | MeshViewer с 3D моделью |
| "Далее" → Шаг 5 | Форма с полем названия |
| "Сохранить" | Redirect на `/` |

### Визуальное соответствие макетам
| Проверка | Файл макета |
|----------|-------------|
| Login layout (50/50, оранжевый/белый) | `docs/design/00_login.png` |
| Dashboard пустой | `docs/design/01_dashboard_empty.png` |
| Dashboard с файлами | `docs/design/02_dashboard_file.png` |
| Wizard шаг 1 пустой | `docs/design/03_upload_empty.png` |
| Wizard шаг 1 несколько файлов | `docs/design/04_upload_multiple.png` |
| Wizard шаг 1 один файл + метаданные | `docs/design/05_upload_single.png` |
| Wizard шаг 2 редактирование | `docs/design/07_edit_mask.png` |
| Wizard шаг 3 построение | `docs/design/09_hough_build.png` |

## TypeScript Coverage Mapping

Каждый новый файл должен иметь полную типизацию:

| Файл | Что типизировать |
|------|-----------------|
| `types/wizard.ts` | `WizardState`, `WizardStep`, `UploadedFile` |
| `types/dashboard.ts` | `ReconstructionCard` |
| `hooks/useWizard.ts` | `UseWizardReturn` interface |
| `hooks/useFileUpload.ts` | `UseFileUploadReturn` interface |
| `components/UI/Button.tsx` | `ButtonProps` (variant, size, onClick, disabled, children) |
| `components/UI/IconButton.tsx` | `IconButtonProps` |
| `components/Wizard/StepIndicator.tsx` | `StepIndicatorProps` (totalSteps, currentStep) |
| `components/Layout/AppLayout.tsx` | Нет props (использует Outlet) |

## Критерии готовности фазы

Каждая фаза считается завершённой когда:
- [ ] `tsc --noEmit` — 0 ошибок
- [ ] `npm run lint` — 0 предупреждений
- [ ] Ручное тестирование сценариев фазы пройдено
- [ ] Нет `any`, нет inline-стилей, нет `console.log`
