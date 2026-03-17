# Research: frontend-redesign
date: 2026-03-17

## Summary

The frontend is a React 18 + TypeScript + Vite SPA with React Router v6, Three.js (via react-three-fiber), Fabric.js for canvas editing, and Axios for HTTP. The codebase has 5 pages and 6 components totaling ~1340 lines. The main architectural debt is `AddReconstructionPage.tsx` (400 lines) which mixes multi-step wizard state, API orchestration, image manipulation, and rendering in a single component. There is no global state library in use (Zustand is installed but unused), no test infrastructure, and styling is a mix of global CSS variables, component CSS files, and inline styles.

The backend exposes a complete REST API at `/api/v1` covering auth, file upload, reconstruction pipeline, and navigation. All API client functions already exist in `apiService.ts` and are correct — the redesign is purely frontend-side. The Three.js viewer (`MeshViewer.tsx`) works correctly and should be preserved.

The target architecture per `prompts/frontend_style.md` requires: `api/` (HTTP clients), `hooks/` (all logic), `components/` (UI only), `pages/` (assembly), `types/` (interfaces). Currently `hooks/` has 1 file, `types/` has 1 file, and logic lives in page components.

## Architecture — Current State

### Backend Structure (relevant to frontend-redesign)

All endpoints are registered under `/api/v1` prefix (`backend/main.py`).

**Auth endpoints** (`backend/app/api/auth.py`):
- `POST /token/login/` — OAuth2 login, returns `{ auth_token }`
- `POST /token/logout/` — invalidates token
- `POST /users/` — register, returns user data
- `GET /users/me/` — current user

**Upload endpoints** (`backend/app/api/upload.py`):
- `POST /upload/plan-photo/` — multipart upload, returns `{ id, url, file_type, ... }`
- `POST /upload/user-mask/` — multipart upload, returns `{ id, url, ... }`

**Reconstruction endpoints** (`backend/app/api/reconstruction.py`):
- `POST /reconstruction/initial-masks` — body: `{ file_id, crop?, rotation? }`, returns `{ id, url, ... }`
- `POST /reconstruction/houghs` — stub, body: `{ plan_file_id, user_mask_file_id }`
- `POST /reconstruction/reconstructions` — body: `{ plan_file_id, user_mask_file_id }`, returns `{ id, name, status, url, ... }`
- `GET /reconstruction/reconstructions` — returns `ReconstructionListItem[]`
- `GET /reconstruction/reconstructions/{id}` — returns full reconstruction detail
- `PUT /reconstruction/reconstructions/{id}/save` — body: `{ name }`
- `DELETE /reconstruction/reconstructions/{id}`
- `GET /reconstruction/reconstructions/{id}/vectors` — returns `VectorizationResult`
- `PUT /reconstruction/reconstructions/{id}/rooms` — body: `{ rooms: [{ number, x, y }] }`

**Navigation endpoints** (`backend/app/api/navigation.py`):
- `POST /navigation/route` — body: `{ start_point, end_point }` (format "A304"), returns stub route

**Reconstruction statuses** (`backend/app/models/reconstruction.py`):
- 1=CREATED, 2=PROCESSING, 3=COMPLETED, 4=ERROR

### Frontend Structure (relevant to frontend-redesign)

**Entry & routing** (`frontend/src/main.tsx:1`, `frontend/src/App.tsx:1`):
- BrowserRouter with v7 future flags
- Routes: `/` → HomePage, `/login` → LoginPage, `/reconstructions` → ReconstructionsListPage, `/reconstructions/add` → AddReconstructionPage, `/mesh/:id` → ViewMeshPage
- NavBar hidden on `/login` via `useLocation()` (`App.tsx:15`)

**Pages:**
- `frontend/src/pages/LoginPage.tsx` — 133 lines, form with login/register toggle, local state only
- `frontend/src/pages/HomePage.tsx` — 49 lines, static landing with nav cards
- `frontend/src/pages/ReconstructionsListPage.tsx` — 67 lines, fetches list on mount, renders links
- `frontend/src/pages/AddReconstructionPage.tsx` — 400 lines, 5-step wizard (upload→mask→hough→mesh→save), all state and logic inline
- `frontend/src/pages/ViewMeshPage.tsx` — 96 lines, uses `useMeshViewer` hook, renders `MeshViewer`

**Components:**
- `frontend/src/components/NavBar.tsx:1` — 37 lines, links + logout handler
- `frontend/src/components/CropSelector.tsx:24` — 162 lines, modal drag-to-select crop, props: `imageUrl, onCropComplete, onCancel`
- `frontend/src/components/MaskEditor.tsx:10` — 194 lines, Fabric.js canvas editor, props: `planUrl, maskUrl?, onSave`
- `frontend/src/components/MeshViewer.tsx:1` — 201 lines, react-three-fiber Canvas with OBJ/GLB loaders, props: `url, format?`
- `frontend/src/components/MeshViewer/RoomLabels.tsx:8` — 30 lines, overlay labels, props: `labels: RoomLabel[]`
- `frontend/src/components/MeshViewer/ViewerControls.tsx:9` — 50 lines, view mode toggle + download, props: `glbUrl, viewMode, onViewModeChange`

**Hooks:**
- `frontend/src/hooks/useMeshViewer.ts:11` — fetches reconstruction by ID, returns `{ meshData, isLoading, error }`, has unmount cancellation

**Types:**
- `frontend/src/types/reconstruction.ts:1` — `RoomLabel` (id, name, room_type, center_x, center_y, color), `ReconstructionDetail` (id, name, status, url, error_message, room_labels)

**API client:**
- `frontend/src/api/apiService.ts:1` — singleton axios instance, auth interceptors (Bearer token from localStorage, redirect on 401/403), namespaced: `authApi`, `uploadApi`, `reconstructionApi`, `navigationApi`

**Styling:**
- `frontend/src/styles/index.css` — CSS variables: `--primary-color: #2563eb`, `--bg-primary: #0f172a`, `--bg-secondary: #1e293b`, `--bg-card: #334155`, `--text-primary: #f8fafc`, `--border-radius: 12px`
- `frontend/src/components/CropSelector.css` — component-scoped modal styles
- Inline styles used in `AddReconstructionPage.tsx` and `MaskEditor.tsx`

### Database Models

- `UploadedFile` (`backend/app/db/models/reconstruction.py`) — id (UUID), filename, file_path, url, file_type (1=Plan, 2=Mask, 3=Env), uploaded_by (FK), uploaded_at
- `Reconstruction` (`backend/app/db/models/reconstruction.py`) — id, name, plan_file_id (FK), mask_file_id (FK nullable), mesh_file_id_obj, mesh_file_id_glb, status (1-4), error_message, vectorization_data (JSON), created_by (FK), created_at, updated_at
- `Room` (`backend/app/db/models/reconstruction.py`) — id, reconstruction_id (FK), number, x, y
- `User` (`backend/app/db/models/user.py`) — id, username (unique), email (unique), hashed_password, is_active, is_staff, is_superuser, date_joined

## Closest Analog Feature

**AddReconstructionPage** — the most complex existing feature, demonstrates the full wizard pattern.

- Files: `frontend/src/pages/AddReconstructionPage.tsx` (400 lines), `frontend/src/components/MaskEditor.tsx`, `frontend/src/components/CropSelector.tsx`, `frontend/src/api/apiService.ts`
- Data flow: `handlePlanUpload()` → `uploadApi.uploadPlanPhoto(file)` → set state → render MaskEditor → `handleCalculateMask()` → `reconstructionApi.calculateMask(fileId, crop, rotation)` → set maskFileId → next step → `reconstructionApi.calculateMesh()` → navigate to `/mesh/{id}`
- Error handling: single `error` state string, displayed inline; no per-step granularity
- Tests: none — no test infrastructure in frontend

## Existing Patterns to Reuse

- Axios interceptor pattern — `frontend/src/api/apiService.ts:18` — auth token injection + 401 redirect
- Cancellation flag pattern — `frontend/src/hooks/useMeshViewer.ts:20` — `let cancelled = false` in useEffect cleanup
- Three.js Canvas setup — `frontend/src/components/MeshViewer.tsx:155` — react-three-fiber Canvas with Suspense, OrbitControls, lighting rig
- CSS variable theming — `frontend/src/styles/index.css:7` — dark theme variables already defined
- CropRect normalized coords — `frontend/src/components/CropSelector.tsx:28` — mouse position converted to 0-1 ratios matching backend `CropRect` model

## Integration Points

- **Auth**: token stored in `localStorage` as `'auth_token'`, injected by axios interceptor (`apiService.ts:22`), cleared on logout (`apiService.ts:35`) or 401 (`apiService.ts:35`)
- **File storage**: uploads served as static files at `/api/v1/uploads/` (`backend/main.py`), URLs returned directly in upload responses
- **API**: all endpoints already have client functions in `apiService.ts` — no new API functions needed for redesign
- **3D rendering**: `MeshViewer.tsx` accepts `url` prop (OBJ or GLB), auto-detects format, renders with react-three-fiber — no changes needed
- **Vite proxy**: `/api` → `http://localhost:8000` (`frontend/vite.config.ts:10`)

## Gaps (what's missing for this feature)

- No layout components — no `AppLayout`, `Header`, `Sidebar` — NavBar is the only navigation element
- `AddReconstructionPage.tsx` mixes wizard state, API calls, canvas helpers, and rendering — needs extraction into hooks
- No custom hooks for upload flow (`useFileUpload`, `useWizard`, `useCalculateMask`)
- Types defined inline in components — only 2 interfaces in `types/reconstruction.ts`
- No shared UI primitives — buttons, cards, modals are styled ad-hoc per page
- Zustand installed (`package.json:21`) but unused — no global state for auth user data
- No test infrastructure — no vitest/jest, no testing-library in package.json
- Inline styles in `AddReconstructionPage.tsx` and `MaskEditor.tsx` violate style guide
- `console.error` used in `ReconstructionsListPage.tsx` — should use proper error state
- No `components/Layout/`, `components/UI/`, `components/Wizard/` directories

## Key Files

- `frontend/src/pages/AddReconstructionPage.tsx` — largest file (400 lines), primary redesign target
- `frontend/src/api/apiService.ts` — complete API client, preserve as-is
- `frontend/src/components/MeshViewer.tsx` — working Three.js viewer, preserve as-is
- `frontend/src/styles/index.css` — CSS variables and global styles, extend for redesign
- `frontend/src/hooks/useMeshViewer.ts` — only existing hook, reference pattern for new hooks
- `frontend/src/types/reconstruction.ts` — only existing types file, extend for redesign
- `backend/app/models/reconstruction.py` — Pydantic response shapes that frontend must match
- `frontend/src/App.tsx` — routing, will need updates for new pages/layout
