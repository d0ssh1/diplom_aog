import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWizard } from '../hooks/useWizard';
import { useFileUpload } from '../hooks/useFileUpload';
import { WizardShell } from '../components/Wizard/WizardShell';
import { StepUpload } from '../components/Wizard/StepUpload';
import { StepPreprocess } from '../components/Wizard/StepPreprocess';
import { StepWallEditor } from '../components/Wizard/StepWallEditor';
import { StepBuild } from '../components/Wizard/StepBuild';
import { StepView3D } from '../components/Wizard/StepView3D';
import { StepSave } from '../components/Wizard/StepSave';
import type { WallEditorCanvasRef } from '../components/Editor/WallEditorCanvas';

export const WizardPage: React.FC = () => {
  const navigate = useNavigate();
  const wizard = useWizard();
  const upload = useFileUpload();
  const canvasRef = useRef<WallEditorCanvasRef>(null);

  const { state } = wizard;

  const handleNext = async () => {
    if (state.step === 1 && upload.files.length > 0) {
      const file = upload.files[0];
      wizard.setPlanFile(file.id, file.url);
      wizard.nextStep();
    } else if (state.step === 2) {
      await wizard.calculateMask();
      wizard.nextStep();
    } else if (state.step === 3 && canvasRef.current) {
      const blob = await canvasRef.current.getBlob();
      const { rooms, doors } = canvasRef.current.getAnnotations();
      await wizard.saveMaskAndAnnotations(blob, rooms, doors);
      wizard.nextStep();
    } else if (state.step === 4) {
      wizard.nextStep();
    }
  };

  const handlePrev = () => {
    if (state.step === 1) {
      navigate('/admin');
    } else if (state.step === 3) {
      if (!window.confirm('Вернуться на шаг 2? Все нарисованные стены и разметка будут потеряны.')) return;
      wizard.prevStep();
    } else {
      wizard.prevStep();
    }
  };

  const isNextDisabled =
    (state.step === 1 && upload.files.length === 0) ||
    (state.step === 2 && state.isLoading) ||
    (state.step === 3 && state.isLoading) ||
    (state.step === 4 && !state.reconstructionId) ||
    state.isLoading;

  const renderStep = () => {
    switch (state.step) {
      case 1:
        return (
          <StepUpload
            files={upload.files}
            onFilesSelect={upload.addFiles}
            onRemove={upload.removeFile}
            isUploading={upload.isUploading}
          />
        );
      case 2:
        return (
          <StepPreprocess
            planUrl={state.planUrl!}
            cropRect={state.cropRect}
            rotation={state.rotation}
            onCropChange={wizard.setCropRect}
            onRotate={() =>
              wizard.setRotation(((state.rotation + 90) % 360) as 0 | 90 | 180 | 270)
            }
          />
        );
      case 3:
        return (
          <StepWallEditor
            maskUrl={`/api/v1/uploads/${state.maskFileId}`}
            canvasRef={canvasRef}
          />
        );
      case 4:
        return (
          <StepBuild
            onBuild={wizard.buildMesh}
            isBuilding={state.isLoading}
            error={state.error}
          />
        );
      case 5:
        return (
          <StepView3D
            meshUrl={state.meshUrl}
            reconstructionId={state.reconstructionId}
          />
        );
      case 6:
        return <StepSave onSave={wizard.save} isLoading={state.isLoading} />;
      default:
        return null;
    }
  };

  return (
    <WizardShell
      currentStep={state.step}
      totalSteps={6}
      onNext={handleNext}
      onPrev={handlePrev}
      onClose={() => navigate('/admin')}
      nextDisabled={isNextDisabled}
    >
      {renderStep()}
    </WizardShell>
  );
};

export default WizardPage;
