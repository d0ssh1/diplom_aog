# Feature Plan: User Profile Fields + Admin Approval UI Redesign

## Overview
Добавление полей ФИО и даты рождения в регистрацию пользователей + редизайн страницы подтверждения учетных записей администратором.

## Design
Нет отдельного design документа — это UI enhancement + data model extension.

## Phases

### Phase 1: Backend — Extend User Model
**Goal:** Добавить поля `full_name` и `birth_date` в модель User

**Files to modify:**
- `backend/app/db/models/user.py` — добавить поля в ORM модель
- `backend/app/models/user.py` — добавить поля в Pydantic схемы (UserCreate, UserResponse)
- `backend/app/api/auth.py` — обновить endpoint регистрации для приема новых полей

**Changes:**
```python
# ORM Model
full_name: str = Column(String(255), nullable=False)
birth_date: date = Column(Date, nullable=False)

# Pydantic
class UserCreate(BaseModel):
    username: str
    password: str
    email: str | None = None
    full_name: str = Field(..., min_length=2, max_length=255)
    birth_date: date = Field(...)

class UserResponse(BaseModel):
    id: int
    username: str
    email: str | None
    full_name: str
    birth_date: date
    is_active: bool
    is_superuser: bool
    date_joined: datetime
```

**Verification:**
- [ ] `pytest tests/api/test_auth.py -v` — все тесты проходят
- [ ] POST `/api/v1/users/` с новыми полями возвращает 201
- [ ] GET `/api/v1/users/pending/` возвращает full_name и birth_date

---

### Phase 2: Backend — Database Migration
**Goal:** Создать Alembic миграцию для добавления полей

**Files to create:**
- `backend/alembic/versions/XXXX_add_user_profile_fields.py`

**Commands:**
```bash
cd backend
alembic revision --autogenerate -m "add user profile fields"
alembic upgrade head
```

**Verification:**
- [ ] Миграция применяется без ошибок
- [ ] `sqlite3 backend/diplom.db ".schema users"` показывает новые колонки

---

### Phase 3: Frontend — Update Registration Form
**Goal:** Добавить поля ФИО и дата рождения в RegisterPage

**Files to modify:**
- `frontend/src/pages/RegisterPage.tsx` — добавить input для full_name и birth_date
- `frontend/src/pages/RegisterPage.module.css` — стили для новых полей
- `frontend/src/api/apiService.ts` — обновить тип данных для register()

**Changes:**
```tsx
const [fullName, setFullName] = useState('');
const [birthDate, setBirthDate] = useState('');

// Validation
if (fullName.length < 2) {
  setError('ФИО должно содержать минимум 2 символа');
  return;
}

// API call
await authApi.register({
  username,
  password,
  email,
  full_name: fullName,
  birth_date: birthDate,
});
```

**Verification:**
- [ ] `npm run build` — без ошибок TypeScript
- [ ] Форма регистрации показывает новые поля
- [ ] Валидация работает (пустые поля → ошибка)
- [ ] Успешная регистрация создает пользователя с новыми данными

---

### Phase 4: Frontend — Redesign PendingUsersPage
**Goal:** Переделать страницу подтверждения по дизайну из verify.txt

**Files to modify:**
- `frontend/src/pages/PendingUsersPage.tsx` — полная переделка UI
- `frontend/src/pages/PendingUsersPage.module.css` — новые стили (brutalist design)

**Design requirements (from verify.txt):**
- Заголовок: "Запросы на регистрацию" + счетчик ожидающих
- Карточки пользователей с:
  - ID заявки (REQ-XXXX формат)
  - ФИО (крупный шрифт)
  - Email + дата регистрации
  - Кнопки "Подтвердить" (оранжевая) и "Отклонить" (белая)
- Brutalist стиль: черные рамки, тени, hover эффекты
- Toast уведомления при действиях
- Анимация исчезновения карточки после действия

**Key UI elements:**
```tsx
// Счетчик
<div className="bg-black text-white px-4 py-2 font-mono text-sm border-2 border-black shadow-[4px_4px_0px_0px_#FF4500]">
  ОЖИДАЮТ: {pendingCount}
</div>

// Карточка пользователя
<div className="bg-white border-2 border-black p-6 hover:shadow-[6px_6px_0px_0px_rgba(255,69,0,1)]">
  <span className="font-mono text-xs bg-gray-200 px-2 py-1">REQ-{user.id}</span>
  <h3 className="text-xl font-bold">{user.full_name}</h3>
  <p className="font-mono text-sm text-gray-600">EMAIL: {user.email}</p>
  <p className="font-mono text-sm text-gray-600">ДАТА: {formatDate(user.date_joined)}</p>
</div>

// Toast
<div className="fixed bottom-10 right-10 bg-black border-2 border-[#FF4500] text-white p-4 font-mono">
  SYS.MSG // {message}
</div>
```

**Verification:**
- [ ] Страница соответствует дизайну из verify.txt
- [ ] Счетчик показывает правильное количество
- [ ] Кнопки работают (подтверждение/отклонение)
- [ ] Toast уведомления появляются
- [ ] Анимация исчезновения карточки работает
- [ ] Адаптивная верстка (mobile + desktop)

---

### Phase 5: Frontend — Add Reject Functionality
**Goal:** Добавить endpoint для отклонения заявки (сейчас есть только approve)

**Files to modify:**
- `backend/app/api/auth.py` — добавить POST `/users/{user_id}/reject/`
- `frontend/src/api/apiService.ts` — добавить `rejectUser()`
- `frontend/src/pages/PendingUsersPage.tsx` — подключить reject к кнопке

**Backend endpoint:**
```python
@router.post("/users/{user_id}/reject/", status_code=status.HTTP_200_OK)
async def reject_user(
    user_id: int,
    current_user: User = Depends(get_current_superuser),
    session: AsyncSession = Depends(get_session),
):
    """Отклонить заявку пользователя (удалить из БД)."""
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await session.delete(user)
    await session.commit()
    return {"status": "rejected", "user_id": user_id}
```

**Verification:**
- [ ] POST `/api/v1/users/{id}/reject/` удаляет пользователя
- [ ] Только superuser может отклонять
- [ ] Frontend кнопка "Отклонить" работает
- [ ] Toast показывает "Заявка отклонена"

---

## Acceptance Criteria

- [ ] Форма регистрации содержит поля ФИО и дата рождения
- [ ] Валидация: ФИО ≥ 2 символа, дата рождения обязательна
- [ ] Страница подтверждения показывает ФИО вместо username
- [ ] Дизайн страницы подтверждения соответствует verify.txt (brutalist стиль)
- [ ] Администратор может подтвердить или отклонить заявку
- [ ] Toast уведомления работают
- [ ] Все существующие тесты проходят
- [ ] Миграция БД применяется без ошибок

---

## Notes

- Используем Opus 4.6 для Lead (как указано в команде)
- Sonnet 4.6 для implementers
- Haiku для rv-build и rv-plan
- Brutalist дизайн: черные рамки 2px, тени с оранжевым (#FF4500), font-mono для технических элементов
