# Behavior: Frontend Redesign

## Data Flow Diagrams

### DFD: Аутентификация

```mermaid
flowchart LR
    User([Пользователь]) -->|username + password| LoginPage
    LoginPage -->|authApi.login| Backend[POST /token/login/]
    Backend -->|auth_token| LoginPage
    LoginPage -->|localStorage.setItem| Storage[(localStorage)]
    LoginPage -->|navigate| Dashboard[DashboardPage]
    Storage -.->|Bearer token| Interceptor[axios interceptor]
    Interceptor -.->|все запросы| Backend
```

### DFD: Dashboard — загрузка списка

```mermaid
flowchart LR
    User([Пользователь]) -->|открывает /| DashboardPage
    DashboardPage -->|reconstructionApi.getReconstructions| Backend[GET /reconstructions]
    Backend -->|ReconstructionListItem[]| DashboardPage
    DashboardPage -->|пусто| EmptyState[Иконка × + кнопка Начать]
    DashboardPage -->|есть данные| FileGrid[Сетка карточек]
```

### DFD: Wizard — полный flow

```mermaid
flowchart TD
    Start([Пользователь]) -->|/upload| Step1[Шаг 1: Загрузка]
    Step1 -->|uploadApi.uploadPlanPhoto| API1[POST /upload/plan-photo/]
    API1 -->|planFileId + planUrl| Step1
    Step1 -->|Далее| Step2[Шаг 2: Маска]
    Step2 -->|reconstructionApi.calculateMask| API2[POST /reconstruction/initial-masks]
    API2 -->|maskFileId| Step2
    Step2 -->|ручное редактирование| Canvas[Fabric.js canvas]
    Canvas -->|uploadApi.uploadUserMask| API2b[POST /upload/user-mask/]
    API2b -->|editedMaskId| Step2
    Step2 -->|Далее| Step3[Шаг 3: Построение]
    Step3 -->|reconstructionApi.calculateMesh| API3[POST /reconstruction/reconstructions]
    API3 -->|reconstructionId| Step3
    Step3 -->|Далее| Step4[Шаг 4: 3D просмотр]
    Step4 -->|reconstructionApi.getReconstructionById| API4[GET /reconstructions/id]
    API4 -->|meshUrl| MeshViewer[MeshViewer]
    Step4 -->|Далее| Step5[Шаг 5: Сохранение]
    Step5 -->|reconstructionApi.saveReconstruction| API5[PUT /reconstructions/id/save]
    API5 -->|OK| Navigate[navigate /]
```

---

## Sequence Diagrams

### Use Case 1: Вход в систему

```mermaid
sequenceDiagram
    actor User
    participant LoginPage
    participant apiService as apiService.authApi
    participant Backend as POST /token/login/
    participant Storage as localStorage

    User->>LoginPage: вводит логин/пароль, нажимает "Войти"
    LoginPage->>LoginPage: setLoading(true)
    LoginPage->>apiService: authApi.login(username, password)
    apiService->>Backend: POST /api/v1/token/login/ (form-urlencoded)
    Backend-->>apiService: { auth_token }
    apiService-->>LoginPage: { auth_token }
    LoginPage->>Storage: localStorage.setItem('auth_token', token)
    LoginPage->>LoginPage: navigate('/')
```

**Ошибки:**

| Условие | Поведение |
|---------|-----------|
| 401 Unauthorized | setError("Неверный логин или пароль"), красная рамка на инпутах |
| Сеть недоступна | setError("Ошибка соединения") |
| Пустые поля | Валидация до запроса, setError("Заполните все поля") |

---

### Use Case 2: Dashboard — просмотр и удаление

```mermaid
sequenceDiagram
    actor User
    participant DashboardPage
    participant apiService as reconstructionApi
    participant Backend

    DashboardPage->>apiService: getReconstructions()
    apiService->>Backend: GET /api/v1/reconstruction/reconstructions
    Backend-->>apiService: ReconstructionListItem[]
    apiService-->>DashboardPage: список
    DashboardPage->>DashboardPage: рендер FileGrid или EmptyState

    User->>DashboardPage: клик × на карточке
    DashboardPage->>DashboardPage: setLoading(id)
    DashboardPage->>apiService: deleteReconstruction(id)
    apiService->>Backend: DELETE /api/v1/reconstruction/reconstructions/{id}
    Backend-->>apiService: 204
    DashboardPage->>DashboardPage: убрать карточку из списка
```

**Ошибки:**

| Условие | Поведение |
|---------|-----------|
| Список пуст | EmptyState: иконка ×, "Нет загруженных планов", кнопка "Начать" |
| Ошибка загрузки списка | Показать сообщение об ошибке |
| Ошибка удаления | Показать inline-ошибку, карточка остаётся |

---

### Use Case 3: Wizard — Шаг 1 (загрузка файла)

```mermaid
sequenceDiagram
    actor User
    participant StepUpload
    participant useFileUpload as useFileUpload hook
    participant apiService as uploadApi
    participant Backend

    User->>StepUpload: drag-drop или выбор файла
    StepUpload->>useFileUpload: addFile(file)
    useFileUpload->>useFileUpload: setUploading(true)
    useFileUpload->>apiService: uploadApi.uploadPlanPhoto(file)
    apiService->>Backend: POST /api/v1/upload/plan-photo/ (multipart)
    Backend-->>apiService: { id, url }
    apiService-->>useFileUpload: { id, url }
    useFileUpload->>useFileUpload: добавить в files[], setUploading(false)
    useFileUpload-->>StepUpload: files обновлён

    User->>StepUpload: клик × на файле
    StepUpload->>useFileUpload: removeFile(id)
    useFileUpload->>useFileUpload: убрать из files[]
```

**Ошибки:**

| Условие | Поведение |
|---------|-----------|
| Неверный формат файла | Валидация до загрузки, показать ошибку в DropZone |
| Ошибка загрузки | setError, файл не добавляется в список |
| Кнопка "Далее" без файлов | Заблокирована (disabled) |

---

### Use Case 4: Wizard — Шаг 2 (маска)

```mermaid
sequenceDiagram
    actor User
    participant StepEditMask
    participant useWizard as useWizard hook
    participant apiService as reconstructionApi
    participant Backend
    participant MaskEditor

    Note over StepEditMask: При входе в шаг 2 — автозапрос маски
    StepEditMask->>useWizard: calculateMask(planFileId, cropRect, rotation)
    useWizard->>apiService: reconstructionApi.calculateMask(...)
    apiService->>Backend: POST /api/v1/reconstruction/initial-masks
    Backend-->>apiService: { id, url }
    apiService-->>useWizard: maskFileId
    useWizard-->>StepEditMask: maskUrl для MaskEditor

    User->>MaskEditor: рисует кистью/ластиком
    User->>StepEditMask: нажимает "Далее"
    StepEditMask->>MaskEditor: запрос blob (onSave)
    MaskEditor-->>StepEditMask: Blob (PNG)
    StepEditMask->>apiService: uploadApi.uploadUserMask(blob)
    apiService->>Backend: POST /api/v1/upload/user-mask/
    Backend-->>apiService: { id }
    apiService-->>StepEditMask: editedMaskId
    StepEditMask->>useWizard: setMaskFileId(editedMaskId)
    useWizard->>useWizard: step = 3
```

---

### Use Case 5: Wizard — Шаг 3 (построение 3D)

```mermaid
sequenceDiagram
    actor User
    participant StepBuild
    participant useWizard as useWizard hook
    participant apiService as reconstructionApi
    participant Backend

    User->>StepBuild: клик "Построить"
    StepBuild->>useWizard: buildMesh()
    useWizard->>useWizard: setBuilding(true)
    useWizard->>apiService: reconstructionApi.calculateMesh(planFileId, maskFileId)
    apiService->>Backend: POST /api/v1/reconstruction/reconstructions
    Backend-->>apiService: { id, status, url }
    apiService-->>useWizard: reconstructionId
    useWizard->>useWizard: setReconstructionId, setBuilding(false), step = 4
```

**Ошибки:**

| Условие | Поведение |
|---------|-----------|
| status = 4 (ERROR) | Показать error_message, кнопка "Попробовать снова" |
| Сеть недоступна | setError, кнопка "Построить" снова активна |

---

### Use Case 6: Wizard — Шаг 5 (сохранение)

```mermaid
sequenceDiagram
    actor User
    participant StepSave
    participant useWizard as useWizard hook
    participant apiService as reconstructionApi
    participant Backend

    User->>StepSave: вводит название, нажимает "Сохранить"
    StepSave->>useWizard: save(name)
    useWizard->>apiService: reconstructionApi.saveReconstruction(reconstructionId, name)
    apiService->>Backend: PUT /api/v1/reconstruction/reconstructions/{id}/save
    Backend-->>apiService: OK
    useWizard->>useWizard: navigate('/')
```

---

## State Machine: Wizard

```mermaid
stateDiagram-v2
    [*] --> step1: открыть /upload
    step1 --> step2: файл загружен + "Далее"
    step2 --> step1: "Назад"
    step2 --> step3: маска готова + "Далее"
    step3 --> step2: "Назад"
    step3 --> step4: mesh построен
    step4 --> step3: "Назад"
    step4 --> step5: "Далее"
    step5 --> step4: "Назад"
    step5 --> [*]: "Сохранить" → navigate('/')
```

## WizardState — структура данных

```typescript
interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  planFileId: string | null;       // из uploadApi.uploadPlanPhoto()
  planUrl: string | null;          // URL превью плана
  maskFileId: string | null;       // из reconstructionApi.calculateMask() или uploadApi.uploadUserMask()
  reconstructionId: number | null; // из reconstructionApi.calculateMesh()
  meshUrl: string | null;          // из getReconstructionById().url
  cropRect: CropRect | null;       // { x, y, width, height } в [0,1]
  rotation: 0 | 90 | 180 | 270;
  isLoading: boolean;
  error: string | null;
}
```
