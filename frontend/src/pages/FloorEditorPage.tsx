import React, { useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './FloorEditorPage.module.css';
import { useFloorEditorWizard } from '../hooks/useFloorEditorWizard';
import { Step1Upload } from '../components/FloorEditor/Step1Upload';
import { Step2CropRotate } from '../components/FloorEditor/Step2CropRotate';
import { Step3WallExtraction } from '../components/FloorEditor/Step3WallExtraction';
import { Step4MarkSections } from '../components/FloorEditor/Step4MarkSections';
import { Step5BindPlans } from '../components/FloorEditor/Step5BindPlans';
import { FloorOverview } from '../components/FloorEditor/FloorOverview';
import { FloorSectionsTable } from '../components/FloorEditor/FloorSectionsTable';
import { Toaster } from '../components/Toast/Toaster';

const STEP_LABELS: Record<number, string> = {
  1: 'Загрузка плана этажа',
  2: 'Кадрирование и выбор отсека',
  3: 'Обработка отсека (выделение стен)',
  4: 'Выделение отсека и присвоение номера',
  5: 'Сопоставление отсека с планами этажа',
};

export const FloorEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const wizard = useFloorEditorWizard();

  // Read floor_id from URL query param
  const floorIdParam = searchParams.get('floor_id');
  const urlFloorId = floorIdParam !== null ? parseInt(floorIdParam, 10) : null;

  // Load wizard state when URL floor_id is present
  useEffect(() => {
    if (urlFloorId !== null && !isNaN(urlFloorId)) {
      void wizard.loadFor(urlFloorId);
    }
  }, [urlFloorId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── Header ────────────────────────────────────────────────────────────────
  const stepBadge = (step: number) => (
    <div className={styles.stepBadge}>
      <span className={styles.stepBadgeNum}>{step}</span>
      <span className={styles.stepBadgeLabel}>{STEP_LABELS[step] ?? ''}</span>
    </div>
  );

  const header = (
    <header className={styles.header}>
      <button
        className={styles.backBtn}
        onClick={() => navigate('/admin')}
        type="button"
        title="Назад"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </button>
      <div className={styles.breadcrumb}>
        <span className={styles.breadcrumbBase}>ДВФУ</span>
        <span className={styles.breadcrumbSep}>&gt;</span>
        <span className={styles.breadcrumbCurrent}>Редактор отсеков</span>
      </div>
      {wizard.mode === 'wizard' && stepBadge(wizard.currentStep)}
    </header>
  );

  // ─── No floor_id from URL — show instruction message but still allow wizard ─
  if (urlFloorId === null || isNaN(urlFloorId)) {
    return (
      <div className={styles.page}>
        {header}
        <p className={styles.infoBanner}>
          Откройте страницу через «Корпуса и этажи» → выберите этаж → «Редактировать».
          Можно также добавить параметр <code>?floor_id=N</code> в URL вручную.
        </p>
        <div className={styles.wizardWrap}>
          {/* Allow upload step for testing even without floor_id */}
          <Step1Upload
            schemaImageUrl={wizard.schemaImageUrl}
            isLoading={wizard.isLoading}
            onUploaded={async () => { /* no-op without floorId */ }}
            onNext={wizard.nextStep}
            onBack={() => navigate('/admin')}
          />
        </div>
        <Toaster />
      </div>
    );
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
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
        <Toaster />
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────────
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
                onClick={() => void wizard.loadFor(urlFloorId)}
                type="button"
              >
                Повторить
              </button>
            </div>
          </div>
        </div>
        <Toaster />
      </div>
    );
  }

  // ─── Wizard steps ────────────────────────────────────────────────────────────
  const renderWizardStep = () => {
    switch (wizard.currentStep) {
      case 1:
        return (
          <Step1Upload
            schemaImageUrl={wizard.schemaImageUrl}
            isLoading={wizard.isLoading}
            onUploaded={wizard.setSchemaImage}
            onNext={wizard.nextStep}
            onBack={() => navigate('/admin')}
          />
        );
      case 2:
        return (
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
        );
      case 3:
        return (
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
        );
      case 4:
        return (
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
        );
      case 5:
        return (
          <Step5BindPlans
            sectionDrafts={wizard.sectionDrafts}
            wallPolygons={wizard.wallPolygons}
            buildings={[]}
            isLoading={wizard.isLoading}
            onBind={wizard.bindReconstruction}
            onSave={async () => {
              await wizard.saveAll();
            }}
            onSaveAndExit={handleSaveAndExit}
            onBack={wizard.prevStep}
          />
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
      <Toaster />
    </div>
  );
};
