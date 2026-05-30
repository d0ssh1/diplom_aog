// Step 9 (UC5): build a PREVIEW of the stitched floor mesh, inspect it in 3D,
// then explicitly persist it. Build is preview-only (ADR-17): "Построить"
// produces a preview GLB the operator reviews; "Сохранить этаж" confirms that
// exact preview into floors.mesh_file_glb. An unconfirmed rebuild never clobbers
// a good saved floor.
//
// The preview GLB is loaded by passing the build response's glb_url DIRECTLY to
// MeshViewer (url + format="glb"). We deliberately do NOT use useMeshViewer —
// that hook fetches a *reconstruction* by integer id and cannot load a preview
// GLB by url.
//
// Presentational only — build/confirm state + actions live in useFloorAssembly.

import React from 'react';
import MeshViewer from '../MeshViewer';
import type { BuildFloorPreviewResponse } from '../../types/floorAssembly';
import wizardStyles from './WizardStep.module.css';
import styles from './Step9FloorPreview.module.css';

interface Step9FloorPreviewProps {
  previewGlbUrl: string | null;
  buildResult: BuildFloorPreviewResponse | null;
  meshFileGlb: string | null;
  isBuilding: boolean;
  isConfirming: boolean;
  onBuild: () => Promise<void>;
  onConfirm: () => Promise<void>;
  onBack: () => void;
}

export const Step9FloorPreview: React.FC<Step9FloorPreviewProps> = ({
  previewGlbUrl,
  buildResult,
  meshFileGlb,
  isBuilding,
  isConfirming,
  onBuild,
  onConfirm,
  onBack,
}) => {
  const excluded = buildResult?.excluded_sections ?? [];
  const warnings = buildResult?.warnings ?? [];

  return (
    <div className={wizardStyles.layout}>
      <div className={styles.body}>
        {/* Center — 3D preview of the stitched floor */}
        <div className={styles.viewerPanel}>
          {previewGlbUrl ? (
            // PREVIEW GLB url straight from buildFloorMesh — not useMeshViewer.
            <MeshViewer url={previewGlbUrl} format="glb" />
          ) : (
            <div className={styles.viewerEmpty}>
              {isBuilding
                ? 'Сборка превью этажа…'
                : 'Нажмите «Построить», чтобы собрать превью этажа'}
            </div>
          )}
        </div>

        {/* Right panel — build/confirm + notices */}
        <aside className={styles.panel}>
          <div className={styles.panelTitle}>СБОРКА ЭТАЖА</div>

          <button
            type="button"
            className={styles.buildBtn}
            onClick={() => void onBuild()}
            disabled={isBuilding}
          >
            {isBuilding ? 'Сборка…' : previewGlbUrl ? 'Пересобрать' : 'Построить'}
          </button>

          {buildResult && (
            <div className={styles.infoBlock}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Включено отсеков</span>
                <span className={styles.infoValue}>
                  {buildResult.included_sections.length}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Переходов</span>
                <span className={styles.infoValue}>{buildResult.connector_count}</span>
              </div>
            </div>
          )}

          {excluded.length > 0 && (
            <div className={styles.notice}>
              <div className={styles.noticeTitle}>Исключены из сборки</div>
              <ul className={styles.noticeList}>
                {excluded.map((e) => (
                  <li key={e.section_id}>
                    Отсек #{e.section_id} — {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div className={styles.warning}>
              <div className={styles.warningTitle}>Предупреждения</div>
              <ul className={styles.noticeList}>
                {warnings.map((w, i) => (
                  <li key={`${w.section_id}-${i}`}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}

          {meshFileGlb && (
            <div className={styles.savedBadge}>
              Сохранённый этаж: {meshFileGlb}
            </div>
          )}

          <button
            type="button"
            className={styles.confirmBtn}
            onClick={() => void onConfirm()}
            disabled={isConfirming || buildResult === null}
            title={
              buildResult === null
                ? 'Сначала постройте превью'
                : 'Сохранить собранный этаж'
            }
          >
            {isConfirming ? 'Сохранение…' : 'Сохранить этаж'}
          </button>
        </aside>
      </div>

      <footer className={wizardStyles.footer}>
        <button className={wizardStyles.btnBack} onClick={onBack} type="button">
          ← Назад
        </button>
        <span className={wizardStyles.footerHint}>
          Превью не сохраняется автоматически — нажмите «Сохранить этаж»
        </span>
        <span />
      </footer>
    </div>
  );
};
