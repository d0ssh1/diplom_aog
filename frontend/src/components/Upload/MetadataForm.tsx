import React, { useState } from 'react';
import styles from './MetadataForm.module.css';

interface PlanMetadata {
  building: string;
  floor: string;
  wing: string;
  block: string;
}

interface MetadataFormProps {
  onChange?: (data: PlanMetadata) => void;
}

export const MetadataForm: React.FC<MetadataFormProps> = ({ onChange }) => {
  const [data, setData] = useState<PlanMetadata>({
    building: '',
    floor: '',
    wing: '',
    block: '',
  });

  const handleChange = (field: keyof PlanMetadata, value: string) => {
    const updated = { ...data, [field]: value };
    setData(updated);
    onChange?.(updated);
  };

  return (
    <form className={styles.form}>
      {(
        [
          { key: 'building', label: 'Здание' },
          { key: 'floor', label: 'Этаж' },
          { key: 'wing', label: 'Крыло' },
          { key: 'block', label: 'Блок' },
        ] as { key: keyof PlanMetadata; label: string }[]
      ).map(({ key, label }) => (
        <div key={key} className={styles.field}>
          <label className={styles.label} htmlFor={`meta-${key}`}>
            {label}
          </label>
          <input
            id={`meta-${key}`}
            type="text"
            className={styles.input}
            placeholder={`> ${label}`}
            value={data[key]}
            onChange={(e) => handleChange(key, e.target.value)}
          />
        </div>
      ))}
    </form>
  );
};
