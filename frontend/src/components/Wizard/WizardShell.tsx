import React from 'react';
import { X } from 'lucide-react';
import { StepIndicator } from './StepIndicator';
import { Button } from '../UI/Button';
import styles from './WizardShell.module.css';

interface WizardShellProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  children: React.ReactNode;
}

export const WizardShell: React.FC<WizardShellProps> = ({
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onClose,
  nextDisabled = false,
  nextLabel,
  children,
}) => {
  const resolvedNextLabel = nextLabel ?? (currentStep === totalSteps ? 'Сохранить' : '> Далее');

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <StepIndicator totalSteps={totalSteps} currentStep={currentStep} />
        <button type="button" className={styles.closeBtn} onClick={onClose} title="Закрыть">
          <X size={20} />
        </button>
      </header>

      <div className={styles.content}>{children}</div>

      <footer className={styles.footer}>
        <Button variant="secondary" onClick={onPrev} disabled={currentStep === 1}>
          Назад
        </Button>
        <Button variant="primary" onClick={onNext} disabled={nextDisabled}>
          {resolvedNextLabel}
        </Button>
      </footer>
    </div>
  );
};
