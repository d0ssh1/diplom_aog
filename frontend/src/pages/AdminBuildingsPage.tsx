import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useBuildings } from '../hooks/useBuildings';
import { useFloors } from '../hooks/useFloors';
import type { Building, Floor } from '../types/hierarchy';
import styles from './AdminBuildingsPage.module.css';

// ========================================================
// Validation helpers
// ========================================================

const BUILDING_CODE_RE = /^[A-Za-z]{1,5}$/;

function validateBuildingCode(code: string): string | null {
  if (!code.trim()) return 'Код обязателен';
  if (!BUILDING_CODE_RE.test(code.trim())) return 'Код: 1–5 латинских букв';
  return null;
}

function validateBuildingName(name: string): string | null {
  if (!name.trim()) return 'Название обязательно';
  return null;
}

function validateFloorNumber(raw: string): string | null {
  const n = parseInt(raw, 10);
  if (isNaN(n)) return 'Введите целое число';
  if (n < 0) return 'Номер этажа ≥ 0';
  if (n > 50) return 'Номер этажа ≤ 50';
  return null;
}

// ========================================================
// Toast
// ========================================================

interface ToastState {
  message: string;
  isError: boolean;
}

function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, isError = false) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setToast({ message, isError });
    timerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return { toast, show };
}

// ========================================================
// CreateBuildingModal
// ========================================================

interface BuildingFormValues {
  code: string;
  name: string;
  address: string;
}

interface CreateBuildingModalProps {
  onClose: () => void;
  onSubmit: (values: BuildingFormValues) => Promise<void>;
}

const CreateBuildingModal: React.FC<CreateBuildingModalProps> = ({ onClose, onSubmit }) => {
  const [values, setValues] = useState<BuildingFormValues>({ code: '', name: '', address: '' });
  const [errors, setErrors] = useState<Partial<BuildingFormValues>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const next: Partial<BuildingFormValues> = {};
    const ce = validateBuildingCode(values.code);
    if (ce) next.code = ce;
    const ne = validateBuildingName(values.name);
    if (ne) next.name = ne;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit({ ...values, code: values.code.trim().toUpperCase() });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Создать корпус</h2>
          <button className={styles.modalCloseBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="building-code">
                Код корпуса *
              </label>
              <input
                id="building-code"
                className={`${styles.formInput} ${errors.code ? styles.formInputError : ''}`}
                type="text"
                maxLength={5}
                value={values.code}
                onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))}
                placeholder="A"
                autoFocus
              />
              {errors.code && <p className={styles.formError}>{errors.code}</p>}
              <p className={styles.formHint}>1–5 латинских букв. Будет приведён к ВЕРХНЕМУ регистру.</p>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="building-name">
                Название *
              </label>
              <input
                id="building-name"
                className={`${styles.formInput} ${errors.name ? styles.formInputError : ''}`}
                type="text"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                placeholder="Корпус A"
              />
              {errors.name && <p className={styles.formError}>{errors.name}</p>}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="building-address">
                Адрес
              </label>
              <input
                id="building-address"
                className={styles.formInput}
                type="text"
                value={values.address}
                onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
                placeholder="ул. Примерная, 1"
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========================================================
// EditBuildingModal
// ========================================================

interface EditBuildingModalProps {
  building: Building;
  onClose: () => void;
  onSubmit: (id: number, values: { name: string; address: string }) => Promise<void>;
}

const EditBuildingModal: React.FC<EditBuildingModalProps> = ({ building, onClose, onSubmit }) => {
  const [values, setValues] = useState({ name: building.name, address: building.address ?? '' });
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const next: { name?: string } = {};
    const ne = validateBuildingName(values.name);
    if (ne) next.name = ne;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(building.id, values);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Редактировать корпус {building.code}</h2>
          <button className={styles.modalCloseBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="edit-building-name">
                Название *
              </label>
              <input
                id="edit-building-name"
                className={`${styles.formInput} ${errors.name ? styles.formInputError : ''}`}
                type="text"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                autoFocus
              />
              {errors.name && <p className={styles.formError}>{errors.name}</p>}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="edit-building-address">
                Адрес
              </label>
              <input
                id="edit-building-address"
                className={styles.formInput}
                type="text"
                value={values.address}
                onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========================================================
// CreateFloorModal
// ========================================================

interface CreateFloorModalProps {
  buildingCode: string;
  onClose: () => void;
  onSubmit: (number: number) => Promise<void>;
}

const CreateFloorModal: React.FC<CreateFloorModalProps> = ({ buildingCode, onClose, onSubmit }) => {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateFloorNumber(raw);
    if (err) { setError(err); return; }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(parseInt(raw, 10));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Добавить этаж — корпус {buildingCode}</h2>
          <button className={styles.modalCloseBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="floor-number">
                Номер этажа *
              </label>
              <input
                id="floor-number"
                className={`${styles.formInput} ${error ? styles.formInputError : ''}`}
                type="number"
                min={0}
                max={50}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="1"
                autoFocus
              />
              {error && <p className={styles.formError}>{error}</p>}
              <p className={styles.formHint}>Диапазон: 0–50. Этаж 0 означает цокольный.</p>
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ========================================================
// ConfirmDeleteBuildingModal
// ========================================================

interface ConfirmDeleteBuildingModalProps {
  building: Building;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const ConfirmDeleteBuildingModal: React.FC<ConfirmDeleteBuildingModalProps> = ({
  building,
  onClose,
  onConfirm,
}) => {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Удалить корпус</h2>
          <button className={styles.modalCloseBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.confirmIcon}>
            <AlertTriangle size={48} />
          </div>
          <p className={styles.confirmText}>
            Удалить корпус <strong>{building.code}</strong> — «{building.name}»?
          </p>
          <p className={styles.confirmWarning}>
            Будут каскадно удалены все этажи и отсеки корпуса.
            Планы этажей станут «висячими» (floor_id = NULL).
          </p>
        </div>
        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className={styles.btnDanger}
            onClick={() => { void handleConfirm(); }}
            disabled={submitting}
          >
            {submitting ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ========================================================
// ConfirmDeleteFloorModal
// ========================================================

interface ConfirmDeleteFloorModalProps {
  floor: Floor;
  buildingCode: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const ConfirmDeleteFloorModal: React.FC<ConfirmDeleteFloorModalProps> = ({
  floor,
  buildingCode,
  onClose,
  onConfirm,
}) => {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Удалить этаж</h2>
          <button className={styles.modalCloseBtn} onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.confirmIcon}>
            <AlertTriangle size={48} />
          </div>
          <p className={styles.confirmText}>
            Удалить этаж <strong>{floor.number}</strong> корпуса <strong>{buildingCode}</strong>?
          </p>
          <p className={styles.confirmWarning}>
            Все отсеки этажа будут удалены каскадно.
          </p>
        </div>
        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className={styles.btnDanger}
            onClick={() => { void handleConfirm(); }}
            disabled={submitting}
          >
            {submitting ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ========================================================
// BuildingRow (with expandable floors section)
// ========================================================

interface BuildingRowProps {
  building: Building;
  onEdit: (building: Building) => void;
  onDelete: (building: Building) => void;
  onAddFloor: (building: Building) => void;
  onDeleteFloor: (floor: Floor, building: Building) => void;
  showToast: (message: string, isError?: boolean) => void;
}

const BuildingRow: React.FC<BuildingRowProps> = ({
  building,
  onEdit,
  onDelete,
  onAddFloor,
  onDeleteFloor,
}) => {
  const [expanded, setExpanded] = useState(false);
  const { floors, isLoading: floorsLoading, loadForBuilding } = useFloors();

  const handleExpand = useCallback(() => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded && floors.length === 0 && !floorsLoading) {
      void loadForBuilding(building.id);
    }
  }, [expanded, floors.length, floorsLoading, loadForBuilding, building.id]);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  return (
    <div className={styles.buildingCard}>
      <div className={styles.cardAccent} />

      {/* Card Header */}
      <div className={styles.cardHeader}>
        <div
          className={styles.cardHeaderLeft}
          onClick={handleExpand}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleExpand()}
          aria-expanded={expanded}
        >
          <span className={styles.buildingCode}>{building.code}</span>
          <div className={styles.buildingInfo}>
            <h3 className={styles.buildingName}>{building.name}</h3>
            <div className={styles.buildingMeta}>
              {building.address && (
                <span className={styles.buildingMetaItem}>{building.address}</span>
              )}
              <span className={styles.buildingMetaItem}>
                ЭТАЖЕЙ: {building.floors_count}
              </span>
              <span className={styles.buildingMetaItem}>
                СОЗДАН: {formatDate(building.created_at)}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={(e) => { e.stopPropagation(); onEdit(building); }}
            title="Редактировать"
          >
            <Pencil size={14} />
            Ред.
          </button>
          <button
            type="button"
            className={styles.btnDanger}
            onClick={(e) => { e.stopPropagation(); onDelete(building); }}
            title="Удалить"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={handleExpand}
            aria-label={expanded ? 'Свернуть этажи' : 'Развернуть этажи'}
          >
            <ChevronDown
              size={18}
              className={`${styles.expandIcon} ${expanded ? styles.expandIconOpen : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Floor Section */}
      {expanded && (
        <div className={styles.floorSection}>
          <div className={styles.floorSectionHeader}>
            <p className={styles.floorSectionTitle}>Этажи корпуса {building.code}</p>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => onAddFloor(building)}
            >
              <Plus size={14} />
              Добавить этаж
            </button>
          </div>

          {floorsLoading && (
            <p className={styles.floorSectionLoading}>SYS.LOADING...</p>
          )}

          {!floorsLoading && floors.length === 0 && (
            <p className={styles.floorSectionEmpty}>
              Этажей нет. Добавьте первый этаж.
            </p>
          )}

          {!floorsLoading && floors.length > 0 && (
            <div className={styles.floorList}>
              {floors.map((floor) => (
                <div key={floor.id} className={styles.floorChip}>
                  <span>
                    Этаж <span className={styles.floorChipNumber}>{floor.number}</span>
                  </span>
                  <button
                    type="button"
                    className={styles.floorChipDeleteBtn}
                    onClick={() => onDeleteFloor(floor, building)}
                    title={`Удалить этаж ${floor.number}`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ========================================================
// Modal state discriminated union
// ========================================================

type ModalState =
  | { kind: 'none' }
  | { kind: 'createBuilding' }
  | { kind: 'editBuilding'; building: Building }
  | { kind: 'deleteBuilding'; building: Building }
  | { kind: 'createFloor'; building: Building }
  | { kind: 'deleteFloor'; floor: Floor; building: Building };

// ========================================================
// AdminBuildingsPage
// ========================================================

export const AdminBuildingsPage: React.FC = () => {
  const {
    buildings,
    isLoading,
    error,
    createBuilding,
    updateBuilding,
    deleteBuilding,
  } = useBuildings();

  const { createFloor, deleteFloor } = useFloors();

  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const { toast, show: showToast } = useToast();

  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);

  // --- Create building ---
  const handleCreateBuilding = useCallback(
    async (values: BuildingFormValues) => {
      try {
        await createBuilding({
          code: values.code,
          name: values.name,
          address: values.address || undefined,
        });
        showToast(`Корпус ${values.code} создан`);
        closeModal();
      } catch (err: unknown) {
        const msg = extractApiError(err, `Корпус с кодом ${values.code} уже существует`);
        showToast(msg, true);
      }
    },
    [createBuilding, showToast, closeModal],
  );

  // --- Update building ---
  const handleUpdateBuilding = useCallback(
    async (id: number, values: { name: string; address: string }) => {
      try {
        await updateBuilding(id, { name: values.name, address: values.address || undefined });
        showToast('Корпус обновлён');
        closeModal();
      } catch (err: unknown) {
        const msg = extractApiError(err, 'Ошибка обновления корпуса');
        showToast(msg, true);
      }
    },
    [updateBuilding, showToast, closeModal],
  );

  // --- Delete building ---
  const handleDeleteBuilding = useCallback(
    async (building: Building) => {
      try {
        await deleteBuilding(building.id);
        showToast(`Корпус ${building.code} удалён`);
        closeModal();
      } catch (err: unknown) {
        const msg = extractApiError(err, 'Ошибка удаления корпуса');
        showToast(msg, true);
      }
    },
    [deleteBuilding, showToast, closeModal],
  );

  // --- Create floor ---
  const handleCreateFloor = useCallback(
    async (building: Building, number: number) => {
      try {
        await createFloor(building.id, number);
        showToast(`Этаж ${number} создан в корпусе ${building.code}`);
        closeModal();
      } catch (err: unknown) {
        const msg = extractApiError(
          err,
          `Этаж ${number} уже существует в корпусе ${building.code}`,
        );
        showToast(msg, true);
      }
    },
    [createFloor, showToast, closeModal],
  );

  // --- Delete floor ---
  const handleDeleteFloor = useCallback(
    async (floor: Floor, building: Building) => {
      try {
        await deleteFloor(floor.id);
        showToast(`Этаж ${floor.number} удалён из корпуса ${building.code}`);
        closeModal();
      } catch (err: unknown) {
        const msg = extractApiError(err, 'Ошибка удаления этажа');
        showToast(msg, true);
      }
    },
    [deleteFloor, showToast, closeModal],
  );

  // ---- Render ----

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>SYS.LOADING...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>{error}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Корпуса</h1>
          <p className={styles.subtitle}>
            Управление корпусами и этажами здания
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className={styles.counter}>КОРПУСОВ: {buildings.length}</span>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setModal({ kind: 'createBuilding' })}
          >
            <Plus size={16} />
            Добавить корпус
          </button>
        </div>
      </div>

      {/* List */}
      {buildings.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Building2 size={64} strokeWidth={1} />
          </div>
          <h3 className={styles.emptyTitle}>Корпусов нет</h3>
          <p className={styles.emptyText}>
            SYS.MSG: Создайте первый корпус для начала работы
          </p>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setModal({ kind: 'createBuilding' })}
          >
            <Plus size={16} />
            Создать корпус
          </button>
        </div>
      ) : (
        <div className={styles.buildingList}>
          {buildings.map((building) => (
            <BuildingRow
              key={building.id}
              building={building}
              onEdit={(b) => setModal({ kind: 'editBuilding', building: b })}
              onDelete={(b) => setModal({ kind: 'deleteBuilding', building: b })}
              onAddFloor={(b) => setModal({ kind: 'createFloor', building: b })}
              onDeleteFloor={(floor, b) =>
                setModal({ kind: 'deleteFloor', floor, building: b })
              }
              showToast={showToast}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {modal.kind === 'createBuilding' && (
        <CreateBuildingModal
          onClose={closeModal}
          onSubmit={handleCreateBuilding}
        />
      )}

      {modal.kind === 'editBuilding' && (
        <EditBuildingModal
          building={modal.building}
          onClose={closeModal}
          onSubmit={handleUpdateBuilding}
        />
      )}

      {modal.kind === 'deleteBuilding' && (
        <ConfirmDeleteBuildingModal
          building={modal.building}
          onClose={closeModal}
          onConfirm={() => handleDeleteBuilding(modal.building)}
        />
      )}

      {modal.kind === 'createFloor' && (
        <CreateFloorModal
          buildingCode={modal.building.code}
          onClose={closeModal}
          onSubmit={(number) => handleCreateFloor(modal.building, number)}
        />
      )}

      {modal.kind === 'deleteFloor' && (
        <ConfirmDeleteFloorModal
          floor={modal.floor}
          buildingCode={modal.building.code}
          onClose={closeModal}
          onConfirm={() => handleDeleteFloor(modal.floor, modal.building)}
        />
      )}

      {/* Toast */}
      {toast !== null && (
        <div className={`${styles.toast} ${toast.isError ? styles.toastError : ''}`}>
          <span
            className={`${styles.toastDot} ${toast.isError ? styles.toastDotError : ''}`}
          />
          {toast.message}
        </div>
      )}
    </div>
  );
};

// ========================================================
// Helpers
// ========================================================

function extractApiError(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // Axios error shape
    if (
      'response' in e &&
      e.response !== null &&
      typeof e.response === 'object'
    ) {
      const response = e.response as Record<string, unknown>;
      if ('status' in response && response.status === 409) {
        return fallback;
      }
      if (
        'data' in response &&
        response.data !== null &&
        typeof response.data === 'object'
      ) {
        const data = response.data as Record<string, unknown>;
        if ('detail' in data && typeof data.detail === 'string') {
          return data.detail;
        }
      }
    }
    if ('message' in e && typeof e.message === 'string') {
      return e.message;
    }
  }
  return fallback;
}

export default AdminBuildingsPage;
