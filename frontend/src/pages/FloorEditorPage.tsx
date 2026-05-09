import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './FloorEditorPage.module.css';
import { useFloorEditorWizard } from '../hooks/useFloorEditorWizard';
import { useBuildings } from '../hooks/useBuildings';
import { floorsApi } from '../api/buildingsApi';
import { Step1Upload } from '../components/FloorEditor/Step1Upload';
import { Step2CropRotate } from '../components/FloorEditor/Step2CropRotate';
import { Step3WallExtraction } from '../components/FloorEditor/Step3WallExtraction';
import { Step4MarkSections } from '../components/FloorEditor/Step4MarkSections';
import { Step5BindPlans } from '../components/FloorEditor/Step5BindPlans';
import { FloorOverview } from '../components/FloorEditor/FloorOverview';
import { FloorSectionsTable } from '../components/FloorEditor/FloorSectionsTable';
import type { Floor } from '../types/hierarchy';

const STEP_LABELS: Record<number, string> = {
  1: 'Загрузка плана этажа',
  2: 'Кадрирование и выбор отсека',
  3: 'Обработка отсека (выделение стен)',
  4: 'Выделение отсека и присвоение номера',
  5: 'Сопоставление отсека с планами этажа',
};

export const FloorEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const wizard = useFloorEditorWizard();
  const { buildings } = useBuildings();

  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const [floors, setFloors] = useState<Floor[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<string>('');
  const [floorsLoading, setFloorsLoading] = useState(false);

  // Load floors when building changes
  useEffect(() => {
    if (!selectedBuildingId) {
      setFloors([]);
      setSelectedFloorId('');
      return;
    }
    setFloorsLoading(true);
    void floorsApi
      .listByBuilding(parseInt(selectedBuildingId, 10))
      .then((data) => { setFloors(data); })
      .catch(() => { setFloors([]); })
      .finally(() => setFloorsLoading(false));
  }, [selectedBuildingId]);

  // Load wizard state when floor is selected
  useEffect(() => {
    if (selectedFloorId) {
      void wizard.loadFor(parseInt(selectedFloorId, 10));
    }
  }, [selectedFloorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveAndExit = useCallback(async () => {
    await wizard.saveAll();
    navigate('/admin');
  }, [wizard, navigate]);

  const handleClearAllDrafts = useCallback(() => {
    const count = wizard.sectionDrafts.length;
    for (let i = count - 1; i >= 0; i--) {
      wizard.deleteSectionDraft(i);
    }
  }, [wizard]);

  // Selected building label for breadcrumb
  const selectedBuilding = buildings.find((b) => String(b.id) === selectedBuildingId);
  const breadcrumbBuilding = selectedBuilding ? selectedBuilding.code : 'ДВФУ';

  // Always-visible top header
  const header = (
    <header className={styles.header}>
      <div className={styles.breadcrumb}>
        <span className={styles.breadcrumbBase}>{breadcrumbBuilding}</span>
        <span className={styles.breadcrumbSep}>&gt;</span>
        <span className={styles.breadcrumbCurrent}>Редактор отсеков</span>
      </div>

      <div className={styles.selectors}>
        <div className={styles.selectorGroup}>
          <div className={styles.selectLabel}>Корпус</div>
          <select
            className={styles.select}
            value={selectedBuildingId}
            onChange={(e) => { setSelectedBuildingId(e.target.value); setSelectedFloorId(''); }}
          >
            <option value="">— Корпус —</option>
            {buildings.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.selectorGroup}>
          <div className={styles.selectLabel}>Этаж</div>
          <select
            className={styles.select}
            value={selectedFloorId}
            onChange={(e) => setSelectedFloorId(e.target.value)}
            disabled={!selectedBuildingId || floorsLoading}
          >
            <option value="">— Этаж —</option>
            {floors.map((f) => (
              <option key={f.id} value={String(f.id)}>
                Этаж {f.number}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );

  // Step badge shown in wizard mode
  const stepBadge = (step: number) => (
    <div className={styles.stepBadge}>
      <span className={styles.stepBadgeNum}>{step}</span>
      <span className={styles.stepBadgeLabel}>{STEP_LABELS[step] ?? ''}</span>
    </div>
  );

  // Not selected yet — show empty state inside working area (NOT centered card)
  if (!selectedFloorId) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.workingArea}>
          <aside className={styles.leftPanel}>
            <div className={styles.leftPanelTitle}>Источник</div>
          </aside>
          <div className={styles.centerCanvas}>
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>🏢</div>
              <p className={styles.emptyStateText}>
                Выберите корпус и этаж в шапке для начала работы
              </p>
              {buildings.length === 0 && (
                <a className={styles.emptyStateLink} href="/admin/buildings">
                  Создать корпус
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (wizard.isLoading && !wizard.floorId) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.workingArea}>
          <aside className={styles.leftPanel} />
          <div className={styles.centerCanvas}>
            <div className={styles.emptyState}>
              <div className={styles.spinner} />
              <span className={styles.spinnerText}>Загрузка этажа...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (wizard.error && !wizard.isLoading) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.workingArea}>
          <aside className={styles.leftPanel} />
          <div className={styles.centerCanvas}>
            <div className={styles.emptyState}>
              <p className={styles.errorText}>{wizard.error}</p>
              <button
                className={styles.retryBtn}
                onClick={() => void wizard.loadFor(parseInt(selectedFloorId, 10))}
                type="button"
              >
                Повторить
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderWizardStep = () => {
    switch (wizard.currentStep) {
      case 1:
        return (
          <>
            {stepBadge(1)}
            <Step1Upload
              schemaImageUrl={wizard.schemaImageUrl}
              isLoading={wizard.isLoading}
              onUploaded={wizard.setSchemaImage}
              onNext={wizard.nextStep}
              onBack={() => navigate('/admin')}
            />
          </>
        );
      case 2:
        return (
          <>
            {stepBadge(2)}
            <Step2CropRotate
              schemaImageUrl={wizard.schemaImageUrl ?? ''}
              cropBbox={wizard.cropBbox}
              isLoading={wizard.isLoading}
              onCropBboxChange={wizard.setCropBbox}
              onNext={async () => {
                await wizard.commitCropBbox();
                wizard.nextStep();
              }}
              onBack={wizard.prevStep}
            />
          </>
        );
      case 3:
        return (
          <>
            {stepBadge(3)}
            <Step3WallExtraction
              schemaImageUrl={wizard.schemaImageUrl}
              wallPolygons={wizard.wallPolygons}
              isLoading={wizard.isLoading}
              onTriggerExtraction={wizard.triggerWallExtraction}
              onSetWallPolygons={wizard.setWallPolygons}
              onNext={async () => {
                await wizard.commitWallPolygons();
                wizard.nextStep();
              }}
              onBack={wizard.prevStep}
            />
          </>
        );
      case 4:
        return (
          <>
            {stepBadge(4)}
            <Step4MarkSections
              wallPolygons={wizard.wallPolygons}
              sectionDrafts={wizard.sectionDrafts}
              onAddSectionDraft={wizard.addSectionDraft}
              onDeleteSectionDraft={wizard.deleteSectionDraft}
              onClearAllDrafts={handleClearAllDrafts}
              onNext={wizard.nextStep}
              onBack={wizard.prevStep}
              onGoToWalls={() => wizard.goToStep(3)}
            />
          </>
        );
      case 5:
        return (
          <>
            {stepBadge(5)}
            <Step5BindPlans
              sectionDrafts={wizard.sectionDrafts}
              wallPolygons={wizard.wallPolygons}
              buildings={buildings}
              isLoading={wizard.isLoading}
              onBind={wizard.bindReconstruction}
              onSave={async () => {
                await wizard.saveAll();
              }}
              onSaveAndExit={handleSaveAndExit}
              onBack={wizard.prevStep}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.page}>
      {header}
      {wizard.mode === 'wizard' && (
        <div className={styles.wizardWrap}>
          {renderWizardStep()}
        </div>
      )}
      {wizard.mode === 'overview' && (
        <FloorOverview
          schemaImageUrl={wizard.schemaImageUrl}
          wallPolygons={wizard.wallPolygons}
          sectionDrafts={wizard.sectionDrafts}
          isDirty={wizard.isDirty}
          isLoading={wizard.isLoading}
          onUpdateSectionDraft={wizard.updateSectionDraft}
          onDeleteSectionDraft={wizard.deleteSectionDraft}
          onSave={wizard.saveAll}
          onSwitchToTable={() => wizard.setMode('table')}
          onSwitchToWizard={() => wizard.goToStep(1)}
        />
      )}
      {wizard.mode === 'table' && (
        <FloorSectionsTable
          sectionDrafts={wizard.sectionDrafts}
          isDirty={wizard.isDirty}
          isLoading={wizard.isLoading}
          onUpdateSectionDraft={wizard.updateSectionDraft}
          onDeleteSectionDraft={wizard.deleteSectionDraft}
          onSave={wizard.saveAll}
          onEditScheme={() => wizard.goToStep(1)}
          onSwitchToOverview={() => wizard.setMode('overview')}
        />
      )}
    </div>
  );
};
