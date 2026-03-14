# Как работать с Claude Code + Agent System — Пошаговое руководство

## Что вообще происходит?

Представьте, что вы — **технический директор** маленькой компании. У вас есть команда из AI-агентов. Вы не пишете код сами (хотя можете). Вместо этого вы:

1. Ставите задачу (тикет)
2. Просите исследовать кодовую базу (research)
3. Просите спроектировать решение (design) — и РЕВЬЮИТЕ его
4. Просите составить план реализации (plan) — и РЕВЬЮИТЕ его
5. Запускаете команду на реализацию (implement) — и ПРОВЕРЯЕТЕ результат

Ваша работа — ДУМАТЬ и ПРОВЕРЯТЬ. Работа агентов — ИСКАТЬ, ПРОЕКТИРОВАТЬ и КОДИТЬ.

---

## Подготовка (один раз)

### 1. Установите Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Распакуйте сетап в проект

```bash
cd C:\DIPLOM\diplom_aog
unzip diplom3d_claude_setup_v4.zip
```

### 3. Запустите Claude Code

```bash
cd C:\DIPLOM\diplom_aog
claude
```

Вы увидите терминал Claude Code:
```
╭──────────────────────────────────────╮
│ Claude Code                          │
│ diplom_aog                           │
╰──────────────────────────────────────╯
>
```

Курсор мигает — Claude ждёт вашу команду. Вот тут вы и будете писать.

---

## Фича 0: refactor-core — Полный пример от начала до конца

### Шаг 1: Research

Вы вводите:
```
/research refactor-core
```

**Что произойдёт:**
- Claude прочитает все файлы из `prompts/` (вы увидите "Read 7 files")
- Запустит 2-3 параллельных агентов-исследователей (вы увидите "Explore agents launched")
- Каждый агент просканирует свою часть кода (backend, frontend, integration points)
- Через 2-5 минут они вернут результаты
- Claude создаст файл `docs/research/refactor-core.md`

**Что вы увидите в терминале (примерно):**

```
● Read 7 files (ctrl+o to expand)

● Spawning parallel research agents...

● 3 Explore agents launched
  ├─ Backend architecture analysis
  │  ⎿  Running in the background
  ├─ Pattern discovery
  │  ⎿  Running in the background
  └─ Integration points
     ⎿  Running in the background

● [... ждём 2-5 минут ...]

● Write(docs/research/refactor-core.md)
  ⎿  Wrote 180 lines

● Research Complete: refactor-core
  
  Key findings:
  - processing/ contains service classes with DB access
  - No services/ directory exists
  - No tests/ directory exists
  - ...
  
  Saved to: docs/research/refactor-core.md
  Next step: /design_feature refactor-core fullstack ...
```

**Что вы делаете:**

Откройте файл `docs/research/refactor-core.md` в VS Code (или любом редакторе). Прочитайте его. Проверьте:
- Нашёл ли агент ВСЕ проблемы, которые вы знаете?
- Не упустил ли какие-то файлы?
- Правильно ли описал текущую ситуацию?

Если всё ОК — переходите к следующему шагу. Если что-то упущено — скажите Claude:
```
В research не упомянут файл api/upload.py — в нём тоже есть прямые вызовы processing. Дополни.
```

---

### Шаг 2: Design

Когда research вас устраивает, вводите:
```
/design_feature refactor-core fullstack tickets/00-refactor-core.md
```

(Третий аргумент — путь к тикету, который мы создали. Claude прочитает его как описание задачи.)

**Что произойдёт:**
- Claude прочитает ВСЕ prompts/, тикет, и research
- Создаст папку `docs/features/refactor-core/`
- Создаст 4-6 файлов с дизайном:
  - `README.md` — описание фичи и acceptance criteria
  - `01-architecture.md` — C4 диаграммы (Mermaid) новой структуры
  - `02-behavior.md` — sequence диаграммы (как данные текут)
  - `03-decisions.md` — какие решения приняты и почему
  - `04-testing.md` — какие тесты будут написаны
- Запустит architect-reviewer для проверки дизайна
- Покажет вам итог и спросит approve

**Что вы увидите (примерно):**

```
● Read 8 files (ctrl+o to expand)

● Creating design documents...

● Write(docs/features/refactor-core/README.md)
  ⎿  Wrote 45 lines

● Write(docs/features/refactor-core/01-architecture.md)
  ⎿  Wrote 120 lines

● Write(docs/features/refactor-core/02-behavior.md)
  ⎿  Wrote 80 lines

● Write(docs/features/refactor-core/03-decisions.md)
  ⎿  Wrote 40 lines

● Write(docs/features/refactor-core/04-testing.md)
  ⎿  Wrote 60 lines

● Running architect review...

● Architect Review: ✓ READY

● ## Design Ready: refactor-core
  
  **Summary:** Разделение кода по слоям Clean Architecture
  
  **Key decisions:**
  - processing/ → чистые функции
  - Новый services/ слой для оркестрации
  - Новый repositories/ для DB
  
  **Please:**
  1. ✅ Approve → I'll create the code plan
  2. 🔄 Request changes → tell me what to adjust
  3. ❓ Questions → ask about specific decisions
```

**Что вы делаете:**

ЭТО САМЫЙ ВАЖНЫЙ МОМЕНТ. Откройте каждый файл и прочитайте:

1. **`01-architecture.md`** — посмотрите Mermaid-диаграммы. Вы можете вставить их в https://mermaid.live/ чтобы увидеть визуально. Правильно ли разделены слои? Зависимости направлены правильно?

2. **`02-behavior.md`** — sequence диаграммы. Прочитайте каждый use case. Логично ли? Не упущены ли шаги?

3. **`03-decisions.md`** — согласны ли вы с решениями? Есть ли риски, о которых не подумали?

4. **`04-testing.md`** — достаточно ли тестов? Покрыты ли все важные случаи?

Если всё нравится, напишите:
```
Approved. Создавай план.
```

Если что-то не нравится:
```
В 01-architecture.md меня не устраивает, что MaskService остаётся классом. Хочу чистую функцию preprocess_to_mask(image) → mask. Исправь.
```

Claude исправит конкретный файл и покажет снова.

---

### Шаг 3: Plan

После вашего "Approved" Claude создаст план:

```
● Creating code plan...

● Write(docs/features/refactor-core/plan/README.md)
  ⎿  Wrote 80 lines

● Write(docs/features/refactor-core/plan/phase-01.md)
  ⎿  Wrote 50 lines

● Write(docs/features/refactor-core/plan/phase-02.md)
  ⎿  Wrote 60 lines

● Write(docs/features/refactor-core/plan/phase-03.md)
  ⎿  Wrote 55 lines

● ## Code Plan Ready: refactor-core
  
  **Strategy:** Bottom-up
  **Phases:**
  1. Core: exceptions.py + domain models
  2. Repositories: вынос DB из processing/
  3. Services: новый слой оркестрации
  4. API: рефакторинг роутеров
  5. Tests: тесты для processing/ и services/
  
  **Please:**
  1. ✅ Approve → ready for implementation
```

**Что вы делаете:**

Откройте `plan/README.md` и каждый `phase-NN.md`. Проверьте:
- Логичен ли порядок фаз?
- Каждая фаза самодостаточна?
- Файлы, которые будут созданы/изменены — правильные?
- Verification steps в каждой фазе — достаточные?

Если OK:
```
План одобрен. Начинай имплементацию.
```

---

### Шаг 4: Implement

```
/implement docs/features/refactor-core/plan/README.md
```

**Что произойдёт:**
- Claude (Lead) создаст команду агентов
- Назначит Phase 1 backend-имплементеру
- Имплементер напишет код
- 4 ревьюера проверят параллельно
- Если все ОК — переход к Phase 2
- И так далее до конца

**Что вы увидите (примерно):**

```
● Creating team: refactor-core-impl

● Creating tasks for 5 phases...

● Spawning teammates:
  ├─ backend (implementer)
  ├─ rv-build (build reviewer)
  ├─ rv-arch (architecture reviewer)
  ├─ rv-sec (security reviewer)
  └─ rv-plan (plan compliance reviewer)

● Assigning Phase 1 to backend...

● [backend] Reading standards...
● [backend] Implementing core/exceptions.py...
● [backend] Implementing models/domain.py...
● [backend] Self-check: Build ✅ Tests ✅ Lint ✅
● [backend] Phase 1 done.

● Sending to reviewers...
● [rv-build] ✅ PASS — compile clean, 0 tests (no tests in phase 1)
● [rv-arch] ✅ PASS — exceptions follow pattern, domain models correct
● [rv-sec]  ✅ PASS — no security concerns
● [rv-plan] ✅ PASS — all files from phase-01.md created

● Phase 1: ✅ ALL GATES PASSED

● Assigning Phase 2 to backend...

● [... фазы 2-5 аналогично ...]

● ## ✅ Implementation Complete: refactor-core
  
  ### Quality Gates
  | Phase | Build | Arch | Sec | Plan | Verdict |
  |-------|-------|------|-----|------|---------|
  | 1     | ✅    | ✅   | ✅  | ✅   | ✅      |
  | 2     | ✅    | ✅   | ✅  | ✅   | ✅      |
  ...
  
  ### Commit
  ✅ abc1234 — refactor(core): split into clean architecture layers
  Local only — run `git push` when ready.
```

**Что вы делаете после:**

1. Откройте изменённые файлы и бегло просмотрите код
2. Запустите `cd backend && python -m pytest tests/ -v` — тесты должны проходить
3. Запустите приложение и проверьте вручную, что основной flow (загрузка → маска → 3D) работает
4. Если всё ОК: `git push`
5. Если что-то не так: скажите Claude что именно сломано

---

## Что делать, если что-то пошло не так

### Агенты не запустились / вернули ошибку
```
Claude, агенты не вернули данных. Проведи research сам, без субагентов.
```

### Дизайн плохой
```
Мне не нравится решение X в 01-architecture.md. Хочу вместо этого Y. Исправь.
```
Или откройте файл в VS Code, исправьте руками, скажите:
```
Я поправил 01-architecture.md руками. Продолжай с обновлённым дизайном.
```

### Имплементация сломала существующий код
```
/fix_bug После рефакторинга эндпоинт POST /reconstruction/initial-masks возвращает 500
```

### Claude потратил много токенов и "забыл" контекст
Начните новую сессию Claude Code (`claude` в терминале) и продолжите с того места:
```
/implement docs/features/refactor-core/plan/README.md phase-03
```
(указав конкретную фазу, с которой продолжить)

### Вы не уверены, правильно ли сделано
Спросите Claude:
```
Покажи мне файл services/reconstruction_service.py и объясни, правильно ли он следует prompts/architecture.md
```

---

## Время на одну фичу (ожидание)

| Фаза | Время | Ваша работа |
|------|-------|-------------|
| Research | 3-7 мин | Прочитать research doc (~5 мин) |
| Design | 5-15 мин | Прочитать 4-6 файлов дизайна (~15-30 мин) |
| Plan | 3-5 мин | Прочитать plan + phase files (~10 мин) |
| Implement | 15-60 мин | Проверить итоговый отчёт (~10 мин) |
| **Итого** | **30-90 мин** | **40-60 мин вашего времени** |

Самая большая часть ВАШЕГО времени — ревью дизайна. Это нормально и правильно. Автор видео говорит, что обсуждение дизайна может занять час.
