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
    // delete from tail to head to avoid index shifting issues
    const count = wizard.sectionDrafts.length;
    for (let i = count - 1; i >= 0; i--) {
      wizard.deleteSectionDraft(i);
    }
  }, [wizard]);

  // Header with selectors
  const header = (
    <header className={styles.header}>
      <span className={styles.breadcrumb}>
        ДВФУ &gt; <span>Редактор отсеков</span>
      </span>
      <div className={styles.selectors}>
        <div>
          <div className={styles.selectLabel}>Корпус</div>
          <select
            className={styles.select}
            value={selectedBuildingId}
            onChange={(e) => { setSelectedBuildingId(e.target.value); setSelectedFloorId(''); }}
          >
            <option value="">— Выберите корпус —</option>
            {buildings.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className={styles.selectLabel}>Этаж</div>
          <select
            className={styles.select}
            value={selectedFloorId}
            onChange={(e) => setSelectedFloorId(e.target.value)}
            disabled={!selectedBuildingId || floorsLoading}
          >
            <option value="">— Выберите этаж —</option>
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

  // Not selected yet
  if (!selectedFloorId) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.pickerWrap}>
          <div className={styles.pickerCard}>
            <h2>Редактор отсеков</h2>
            <p>Выберите корпус и этаж для редактирования схемы</p>
            <div className={styles.pickerForm}>
              <div className={styles.pickerFormGroup}>
                <label>Корпус</label>
                <select
                  className={styles.pickerSelect}
                  value={selectedBuildingId}
                  onChange={(e) => { setSelectedBuildingId(e.target.value); setSelectedFloorId(''); }}
                >
                  <option value="">— Выберите корпус —</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.pickerFormGroup}>
                <label>Этаж</label>
                <select
                  className={styles.pickerSelect}
                  value={selectedFloorId}
                  onChange={(e) => setSelectedFloorId(e.target.value)}
                  disabled={!selectedBuildingId || floorsLoading}
                >
                  <option value="">— Выберите этаж —</option>
                  {floors.map((f) => (
                    <option key={f.id} value={String(f.id)}>
                      Этаж {f.number}
                    </option>
                  ))}
                </select>
              </div>
              {buildings.length === 0 && (
                <p style={{ fontSize: '0.875rem', color: '#888' }}>
                  Нет корпусов.{' '}
                  <a href="/admin/buildings" style={{ color: '#ff4500' }}>
                    Создать корпус
                  </a>
                </p>
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
        <div className={styles.spinnerWrap}>
          <div className={styles.spinner} />
          <span className={styles.spinnerText}>Загрузка этажа...</span>
        </div>
      </div>
    );
  }

  // Error
  if (wizard.error && !wizard.isLoading) {
    return (
      <div className={styles.page}>
        {header}
        <div className={styles.errorWrap}>
          <div className={styles.errorCard}>
            <p>{wizard.error}</p>
            <button onClick={() => void wizard.loadFor(parseInt(selectedFloorId, 10))} type="button">
              Повторить
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            buildings={buildings}
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
      {wizard.mode === 'wizard' && renderWizardStep()}
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
