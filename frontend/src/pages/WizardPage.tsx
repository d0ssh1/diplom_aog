import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useWizard } from '../hooks/useWizard';
import { useFileUpload } from '../hooks/useFileUpload';
import { WizardShell } from '../components/Wizard/WizardShell';
import { StepUpload } from '../components/Wizard/StepUpload';
import { StepEditMask } from '../components/Wizard/StepEditMask';
import { StepBuild } from '../components/Wizard/StepBuild';
import { StepView3D } from '../components/Wizard/StepView3D';
import { StepSave } from '../components/Wizard/StepSave';

export const WizardPage: React.FC = () => {
  const navigate = useNavigate();
  const wizard = useWizard();
  const upload = useFileUpload();

  const { state } = wizard;

  const handleNext = () => {
    if (state.step === 1 && upload.files.length > 0) {
      const file = upload.files[0];
      wizard.setPlanFile(file.id, file.url);
      wizard.nextStep();
    } else if (state.step === 4) {
      wizard.nextStep();
    }
  };

  const handlePrev = () => {
    if (state.step === 1) {
      navigate('/');
    } else {
      wizard.prevStep();
    }
  };

  const isNextDisabled =
    (state.step === 1 && upload.files.length === 0) ||
    (state.step === 3 && !state.reconstructionId) ||
    state.isLoading;

  const renderStep = () => {
    switch (state.step) {
      case 1:
        return (
          <StepUpload
            files={upload.files}
            onFileSelect={upload.addFile}
            onRemove={upload.removeFile}
            isUploading={upload.isUploading}
          />
        );
      case 2:
        return (
          <StepEditMask
            planUrl={state.planUrl}
            maskUrl={state.maskFileId ? `/api/v1/uploads/${state.maskFileId}` : null}
            onMaskSave={async (blob) => {
              await wizard.saveMask(blob);
              wizard.nextStep();
            }}
          />
        );
      case 3:
        return (
          <StepBuild
            onBuild={wizard.buildMesh}
            isBuilding={state.isLoading}
            error={state.error}
          />
        );
      case 4:
        return (
          <StepView3D
            meshUrl={state.meshUrl}
            reconstructionId={state.reconstructionId}
          />
        );
      case 5:
        return <StepSave onSave={wizard.save} isLoading={state.isLoading} />;
      default:
        return null;
    }
  };

  return (
    <WizardShell
      currentStep={state.step}
      totalSteps={5}
      onNext={handleNext}
      onPrev={handlePrev}
      onClose={() => navigate('/')}
      nextDisabled={isNextDisabled}
    >
      {renderStep()}
    </WizardShell>
  );
};

export default WizardPage;
