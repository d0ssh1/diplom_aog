// Step 6 (UC2) — bind correspondence points between each section's plan (эталон)
// and the floor's "карта отсеков" (the whole-floor VECTOR map = floor.wall_polygons).
//
// The master backdrop is the vectorised карта отсеков, NOT a single section's
// evacuation poster, with the cropped original raster shown faintly beneath
// (transparency tool, 20% by default). Points are numbered orange discs: the SAME
// number on the эталон and on the карта отсеков is one correspondence pair
// ("ставишь 1, 2, 3" on each side). Selecting a number highlights it on both
// canvases; the delete tool removes a number from both sides at once.
//
// Presentational only — all draft state/persistence lives in useFloorAssembly.

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Crosshair, Trash2 } from 'lucide-react';
import { StitchPointCanvas } from './StitchPointCanvas';
import { nextNumberId, pointLabel } from '../../lib/controlPoints';
import type {
  AssemblySection,
  ControlPoint,
  MasterControlPoint,
} from '../../types/floorAssembly';
import type { CropBbox } from '../../types/hierarchy';
import wizardStyles from './WizardStep.module.css';
import styles from './Step6BindControlPoints.module.css';

type Tool = 'place' | 'delete';

interface Step6BindControlPointsProps {
  sections: AssemblySection[];
  // Master "карта отсеков" backdrop (vector over the cropped raster underlay).
  masterSchemaUrl: string | null;
  masterCropBbox: CropBbox | null;
  masterWallPolygons: [number, number][][] | null;
  masterSizePx: [number, number] | null;
  // Draft points per section, keyed by section id.
  sectionPointsBySection: Record<number, ControlPoint[]>;
  masterPointsBySection: Record<number, MasterControlPoint[]>;
  activeSectionId: number | null;
  activePointId: string | null;
  isLoading: boolean;
  onSelectSection: (sectionId: number) => void;
  onSelectPoint: (pointId: string | null) => void;
  onSetSectionPoint: (sectionId: number, pointId: string, x: number, y: number) => void;
  onSetMasterPoint: (sectionId: number, pointId: string, x: number, y: number) => void;
  onRemovePoint: (sectionId: number, pointId: string) => void;
  onSave: (sectionId: number) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}

const numOf = (id: string): number => {
  const match = /(\d+)/.exec(id);
  return match ? parseInt(match[1], 10) : 0;
};
const byNumber = (a: string, b: string): number => numOf(a) - numOf(b);

export const Step6BindControlPoints: React.FC<Step6BindControlPointsProps> = ({
  sections,
  masterSchemaUrl,
  masterCropBbox,
  masterWallPolygons,
  masterSizePx,
  sectionPointsBySection,
  masterPointsBySection,
  activeSectionId,
  activePointId,
  isLoading,
  onSelectSection,
  onSelectPoint,
  onSetSectionPoint,
  onSetMasterPoint,
  onRemovePoint,
  onSave,
  onBack,
  onNext,
}) => {
  const [tool, setTool] = useState<Tool>('place');
  // Default 20% when the vectorised карта отсеков is present (it is the primary
  // layer, the raster is just a faint reference). When no vector exists yet, the
  // raster IS the only backdrop, so show it fully until the user touches the slider.
  const [underlayOpacity, setUnderlayOpacity] = useState(0.2);
  const [opacityTouched, setOpacityTouched] = useState(false);
  const hasVector = (masterWallPolygons?.length ?? 0) > 0;
  useEffect(() => {
    if (!opacityTouched) setUnderlayOpacity(hasVector ? 0.2 : 1);
  }, [hasVector, opacityTouched]);
  const handleOpacityChange = useCallback((next: number) => {
    setOpacityTouched(true);
    setUnderlayOpacity(next);
  }, []);

  const boundSections = sections.filter((s) => s.reconstruction_id !== null);
  const activeSection =
    sections.find((s) => s.section_id === activeSectionId) ?? null;

  const sectionPts =
    activeSectionId !== null ? sectionPointsBySection[activeSectionId] ?? [] : [];
  const masterPts =
    activeSectionId !== null ? masterPointsBySection[activeSectionId] ?? [] : [];

  const sectionIds = useMemo(() => new Set(sectionPts.map((p) => p.id)), [sectionPts]);
  const masterIds = useMemo(
    () => new Set(masterPts.map((p) => p.point_id)),
    [masterPts],
  );
  const allIds = useMemo(
    () => Array.from(new Set([...sectionIds, ...masterIds])).sort(byNumber),
    [sectionIds, masterIds],
  );
  const pairedCount = allIds.filter(
    (id) => sectionIds.has(id) && masterIds.has(id),
  ).length;

  // Wall vertices the master points snap to (карта отсеков corners).
  const snapTargets = useMemo<[number, number][] | undefined>(
    () => (masterWallPolygons ? masterWallPolygons.flat() : undefined),
    [masterWallPolygons],
  );

  const sectionCanvasPoints = sectionPts.map((p) => ({ id: p.id, x: p.x, y: p.y }));
  const masterCanvasPoints = masterPts.map((p) => ({ id: p.point_id, x: p.x, y: p.y }));
  const sectionMaskUrl = activeSection?.mask_url ?? null;

  // Click on an existing marker: select it, or delete the whole pair in delete mode.
  const handlePointClick = useCallback(
    (id: string) => {
      if (activeSectionId === null) return;
      if (tool === 'delete') {
        onRemovePoint(activeSectionId, id);
        return;
      }
      onSelectPoint(activePointId === id ? null : id);
    },
    [activeSectionId, tool, activePointId, onRemovePoint, onSelectPoint],
  );

  // Miss-click on the эталон: place the active number, or auto-mint the next one
  // for THIS side when nothing is selected (so 1, 2, 3 just by clicking).
  const handleSectionPlace = useCallback(
    (id: string, x: number, y: number) => {
      if (activeSectionId === null || tool === 'delete') return;
      const pid = id !== '' ? id : nextNumberId(sectionPts.map((p) => p.id));
      onSetSectionPoint(activeSectionId, pid, x, y);
    },
    [activeSectionId, tool, sectionPts, onSetSectionPoint],
  );

  const handleMasterPlace = useCallback(
    (id: string, x: number, y: number) => {
      if (activeSectionId === null || tool === 'delete') return;
      const pid = id !== '' ? id : nextNumberId(masterPts.map((p) => p.point_id));
      onSetMasterPoint(activeSectionId, pid, x, y);
    },
    [activeSectionId, tool, masterPts, onSetMasterPoint],
  );

  const handleSave = useCallback(() => {
    if (activeSectionId !== null) void onSave(activeSectionId);
  }, [activeSectionId, onSave]);

  const hasMaster = masterSchemaUrl !== null || (masterWallPolygons?.length ?? 0) > 0;

  return (
    <div className={wizardStyles.layout}>
      <div className={styles.body}>
        {/* Left rail — section list */}
        <aside className={styles.sectionsPanel}>
          <div className={styles.panelTitle}>ОТСЕКИ</div>
          <div className={styles.sectionList}>
            {boundSections.map((s) => {
              const sIds = new Set(
                (sectionPointsBySection[s.section_id] ?? []).map((p) => p.id),
              );
              const mIds = new Set(
                (masterPointsBySection[s.section_id] ?? []).map((p) => p.point_id),
              );
              const paired = [...sIds].filter((id) => mIds.has(id)).length;
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
                  <span className={styles.sectionCount}>{paired} пар</span>
                </button>
              );
            })}
            {boundSections.length === 0 && (
              <div className={styles.emptyHint}>Нет отсеков с планами</div>
            )}
          </div>
        </aside>

        {/* Center — dual canvas (эталон ↔ карта отсеков) */}
        <div className={styles.canvasGrid}>
          <div className={styles.canvasCol}>
            <div className={styles.canvasLabel}>
              {activeSection ? `Отсек ${activeSection.number} — эталон` : 'Эталон'}
            </div>
            <div className={styles.canvasBox}>
              {activeSection && sectionMaskUrl ? (
                <StitchPointCanvas
                  maskUrl={sectionMaskUrl}
                  points={sectionCanvasPoints}
                  activeId={activePointId}
                  tool={tool}
                  onPlace={handleSectionPlace}
                  onSelect={handlePointClick}
                />
              ) : (
                <div className={styles.canvasEmpty}>
                  {activeSection
                    ? 'У отсека нет маски плана'
                    : 'Выберите отсек слева'}
                </div>
              )}
            </div>
          </div>

          <div className={styles.canvasCol}>
            <div className={styles.canvasLabel}>Карта отсеков (весь этаж)</div>
            <div className={styles.canvasBox}>
              {hasMaster ? (
                <StitchPointCanvas
                  underlayUrl={masterSchemaUrl}
                  crop={masterCropBbox}
                  underlayOpacity={underlayOpacity}
                  polygons={masterWallPolygons}
                  fallbackSize={masterSizePx}
                  points={masterCanvasPoints}
                  activeId={activePointId}
                  snapTargets={snapTargets}
                  tool={tool}
                  onPlace={handleMasterPlace}
                  onSelect={handlePointClick}
                />
              ) : (
                <div className={styles.canvasEmpty}>
                  Нет карты отсеков — загрузите и векторизуйте схему этажа
                  (шаги 1–3)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel — tools, point list, transparency, status */}
        <aside className={styles.toolsPanel}>
          <div className={styles.panelTitle}>ИНСТРУМЕНТЫ</div>
          <div className={styles.toolGroup}>
            <button
              type="button"
              className={`${styles.toolBtn} ${
                tool === 'place' ? styles.toolBtnActive : ''
              }`}
              onClick={() => setTool('place')}
            >
              <Crosshair size={16} /> Поставить точку
            </button>
            <button
              type="button"
              className={`${styles.toolBtn} ${
                tool === 'delete' ? styles.toolBtnActive : ''
              }`}
              onClick={() => setTool('delete')}
              disabled={allIds.length === 0}
            >
              <Trash2 size={16} /> Удалить точку
            </button>
          </div>

          <div className={styles.pickerHint}>
            {tool === 'place'
              ? 'Кликайте по эталону и по карте отсеков — точки нумеруются сами (1, 2, 3…). Один и тот же номер слева и справа = одна пара. Клик по точке выделяет её на обеих схемах.'
              : 'Кликните по точке, чтобы удалить её сразу с обеих схем.'}
          </div>

          {activeSection === null ? (
            <div className={styles.emptyHint}>Выберите отсек</div>
          ) : (
            <>
              <div className={styles.panelTitle}>ТОЧКИ (Э — эталон, К — карта)</div>
              <div className={styles.pointList}>
                {allIds.map((id) => {
                  const onL = sectionIds.has(id);
                  const onR = masterIds.has(id);
                  const active = id === activePointId;
                  return (
                    <div
                      key={id}
                      className={`${styles.pointRow} ${
                        active ? styles.pointRowActive : ''
                      }`}
                    >
                      <button
                        type="button"
                        className={styles.pointSelect}
                        onClick={() => onSelectPoint(active ? null : id)}
                      >
                        <span
                          className={styles.numBadge}
                          style={{ background: onL && onR ? '#16a34a' : '#f59e0b' }}
                        >
                          {pointLabel(id)}
                        </span>
                        <span className={styles.chips}>
                          <span className={`${styles.chip} ${onL ? styles.chipOn : ''}`}>
                            Э
                          </span>
                          <span className={`${styles.chip} ${onR ? styles.chipOn : ''}`}>
                            К
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.pointClear}
                        title="Удалить точку с обеих схем"
                        onClick={() => onRemovePoint(activeSection.section_id, id)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                {allIds.length === 0 && (
                  <div className={styles.emptyHint}>
                    Точек пока нет — кликните по схемам
                  </div>
                )}
              </div>

              <div className={styles.panelTitle}>ПРОЗРАЧНОСТЬ СХЕМЫ</div>
              <div className={styles.sliderBox}>
                <input
                  type="range"
                  className={styles.sliderInput}
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(underlayOpacity * 100)}
                  onChange={(e) => handleOpacityChange(Number(e.target.value) / 100)}
                />
                <span className={styles.sliderValue}>
                  {Math.round(underlayOpacity * 100)}%
                </span>
              </div>

              <div className={styles.statusRow}>
                <span className={styles.statusLabel}>Пар сопоставлено</span>
                <span
                  className={`${styles.statusValue} ${
                    pairedCount < 3 ? styles.statusValueLow : ''
                  }`}
                >
                  {pairedCount}
                </span>
              </div>
              {pairedCount < 3 && (
                <div className={styles.statusHint}>
                  Нужно минимум 3 пары для расчёта (масштаб + сдвиг)
                </div>
              )}

              <button
                type="button"
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={isLoading}
              >
                Сохранить точки
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
