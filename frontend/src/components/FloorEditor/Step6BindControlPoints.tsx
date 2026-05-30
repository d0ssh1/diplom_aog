// Step 6 (UC2): re-mark the SAME section-local control-point ids on the floor
// master schema. Dual-panel — the section's mask (left, read-only reference) and
// the master schema (right, editable) — both rendered with the shared
// ControlPointCanvas. Correspondence is established by ID through an active-point
// picker: a master click writes the ACTIVE id's coordinate only (never
// nearest-neighbour), and the active id is highlighted in the SAME colour on
// BOTH canvases so the operator can never confuse two points (AC2).
//
// Presentational only — all state/actions live in useFloorAssembly.

import React, { useCallback } from 'react';
import { ControlPointCanvas } from '../ControlPointCanvas';
import type { AssemblySection, MasterControlPoint } from '../../types/floorAssembly';
import wizardStyles from './WizardStep.module.css';
import styles from './Step6BindControlPoints.module.css';

interface Step6BindControlPointsProps {
  sections: AssemblySection[];
  masterSchemaUrl: string | null;
  sectionThumbUrls: Record<number, string | null>;
  masterPointsBySection: Record<number, MasterControlPoint[]>;
  activeSectionId: number | null;
  activePointId: string | null;
  isLoading: boolean;
  onSelectSection: (sectionId: number) => void;
  onSelectPoint: (pointId: string | null) => void;
  onSetMasterPoint: (sectionId: number, pointId: string, x: number, y: number) => void;
  onRemoveMasterPoint: (sectionId: number, pointId: string) => void;
  onSave: (sectionId: number) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}

export const Step6BindControlPoints: React.FC<Step6BindControlPointsProps> = ({
  sections,
  masterSchemaUrl,
  sectionThumbUrls,
  masterPointsBySection,
  activeSectionId,
  activePointId,
  isLoading,
  onSelectSection,
  onSelectPoint,
  onSetMasterPoint,
  onRemoveMasterPoint,
  onSave,
  onBack,
  onNext,
}) => {
  const boundSections = sections.filter((s) => s.reconstruction_id !== null);
  const activeSection =
    sections.find((s) => s.section_id === activeSectionId) ?? null;

  const sectionPoints = activeSection?.section_control_points ?? [];
  const masterPoints =
    activeSectionId !== null ? masterPointsBySection[activeSectionId] ?? [] : [];
  const placedIds = new Set(masterPoints.map((p) => p.point_id));
  const matchedCount = sectionPoints.filter((p) => placedIds.has(p.id)).length;

  const sectionThumbUrl =
    activeSectionId !== null ? sectionThumbUrls[activeSectionId] ?? null : null;

  // Master canvas: a click writes the ACTIVE id's coord (AC2). The canvas emits
  // onPlace('') when nothing is active — that's a no-op here (no NN matching).
  const handleMasterPlace = useCallback(
    (id: string, x: number, y: number) => {
      if (activeSectionId === null) return;
      if (id === '') return; // nothing active → ignore (active-id only)
      onSetMasterPoint(activeSectionId, id, x, y);
    },
    [activeSectionId, onSetMasterPoint],
  );

  const handleMasterSelect = useCallback(
    (id: string) => {
      onSelectPoint(activePointId === id ? null : id);
    },
    [activePointId, onSelectPoint],
  );

  // Section thumbnail is a read-only reference: placing is disabled, but clicking
  // a point selects that id (drives the active-point picker just like the panel).
  const handleSectionSelect = useCallback(
    (id: string) => {
      onSelectPoint(activePointId === id ? null : id);
    },
    [activePointId, onSelectPoint],
  );
  const noopPlace = useCallback(() => {
    /* section side is read-only */
  }, []);

  const handleSave = useCallback(() => {
    if (activeSectionId !== null) void onSave(activeSectionId);
  }, [activeSectionId, onSave]);

  return (
    <div className={wizardStyles.layout}>
      <div className={styles.body}>
        {/* Left rail — section list */}
        <aside className={styles.sectionsPanel}>
          <div className={styles.panelTitle}>ОТСЕКИ</div>
          <div className={styles.sectionList}>
            {boundSections.map((s) => {
              const pts = masterPointsBySection[s.section_id] ?? [];
              const allIds = s.section_control_points.length;
              const placed = pts.filter((p) =>
                s.section_control_points.some((cp) => cp.id === p.point_id),
              ).length;
              return (
                <button
                  key={s.section_id}
                  type="button"
                  className={`${styles.sectionBtn} ${
                    s.section_id === activeSectionId ? styles.sectionBtnActive : ''
                  }`}
                  onClick={() => onSelectSection(s.section_id)}
                >
                  <span style={{ fontWeight: 600 }}>Отсек {s.number}</span>
                  <span className={styles.sectionCount}>
                    {placed}/{allIds}
                  </span>
                </button>
              );
            })}
            {boundSections.length === 0 && (
              <div className={styles.emptyHint}>Нет отсеков с планами</div>
            )}
          </div>
        </aside>

        {/* Center — dual canvas (section ref ↔ master editable) */}
        <div className={styles.canvasGrid}>
          <div className={styles.canvasCol}>
            <div className={styles.canvasLabel}>Отсек (эталон)</div>
            <div className={styles.canvasBox}>
              {sectionThumbUrl ? (
                <ControlPointCanvas
                  imageUrl={sectionThumbUrl}
                  points={sectionPoints}
                  activeId={activePointId}
                  onPlace={noopPlace}
                  onSelect={handleSectionSelect}
                />
              ) : (
                <div className={styles.canvasEmpty}>Нет изображения отсека</div>
              )}
            </div>
          </div>

          <div className={styles.canvasCol}>
            <div className={styles.canvasLabel}>Мастер-схема этажа</div>
            <div className={styles.canvasBox}>
              {masterSchemaUrl ? (
                <ControlPointCanvas
                  imageUrl={masterSchemaUrl}
                  points={masterPoints.map((p) => ({
                    id: p.point_id,
                    x: p.x,
                    y: p.y,
                  }))}
                  activeId={activePointId}
                  onPlace={handleMasterPlace}
                  onSelect={handleMasterSelect}
                />
              ) : (
                <div className={styles.canvasEmpty}>Нет мастер-схемы</div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel — active-point picker + per-id checklist */}
        <aside className={styles.toolsPanel}>
          <div className={styles.panelTitle}>ТОЧКИ ОТСЕКА</div>
          {activeSection === null ? (
            <div className={styles.emptyHint}>Выберите отсек</div>
          ) : (
            <>
              <div className={styles.pickerHint}>
                Выберите ID, затем кликните по мастер-схеме, чтобы отметить ту же
                точку.
              </div>
              <div className={styles.pointList}>
                {sectionPoints.map((cp) => {
                  const placed = placedIds.has(cp.id);
                  const active = cp.id === activePointId;
                  return (
                    <div
                      key={cp.id}
                      className={`${styles.pointRow} ${
                        active ? styles.pointRowActive : ''
                      }`}
                    >
                      <button
                        type="button"
                        className={styles.pointSelect}
                        onClick={() => onSelectPoint(active ? null : cp.id)}
                      >
                        <span className={styles.pointBadge}>
                          {placed ? '✓' : '○'}
                        </span>
                        <span className={styles.pointId}>{cp.id}</span>
                      </button>
                      {placed && (
                        <button
                          type="button"
                          className={styles.pointClear}
                          title="Убрать с мастер-схемы"
                          onClick={() =>
                            activeSectionId !== null &&
                            onRemoveMasterPoint(activeSectionId, cp.id)
                          }
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
                {sectionPoints.length === 0 && (
                  <div className={styles.emptyHint}>
                    У отсека нет опорных точек (разметьте их в редакторе плана)
                  </div>
                )}
              </div>

              <div className={styles.statusRow}>
                <span className={styles.statusLabel}>Сопоставлено</span>
                <span
                  className={`${styles.statusValue} ${
                    matchedCount < 3 ? styles.statusValueLow : ''
                  }`}
                >
                  {matchedCount}/{sectionPoints.length}
                </span>
              </div>
              {matchedCount < 3 && (
                <div className={styles.statusHint}>
                  Нужно минимум 3 сопоставленных точки для решения
                </div>
              )}

              <button
                type="button"
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={isLoading}
              >
                Сохранить точки отсека
              </button>
            </>
          )}
        </aside>
      </div>

      <footer className={wizardStyles.footer}>
        <button className={wizardStyles.btnBack} onClick={onBack} type="button">
          ← Назад
        </button>
        <span className={wizardStyles.footerHint} />
        <button className={wizardStyles.btnNext} onClick={onNext} type="button">
          Далее ▸
        </button>
      </footer>
    </div>
  );
};
