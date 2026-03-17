import React, { useState } from 'react';
import styles from './MetadataForm.module.css';

interface PlanMetadata {
  building: string;
  floor: string;
  wing: string;
}

interface MetadataFormProps {
  onChange?: (data: PlanMetadata) => void;
}

export const MetadataForm: React.FC<MetadataFormProps> = ({ onChange }) => {
  const [data, setData] = useState<PlanMetadata>({
    building: '',
    floor: '',
    wing: '',
  });

  const handleChange = (field: keyof PlanMetadata, value: string) => {
    const updated = { ...data, [field]: value };
    setData(updated);
    onChange?.(updated);
  };

  return (
    <form className={styles.form}>
      <div className={styles.metaSection}>
        <div className={styles.field}>
          <label className={styles.metaLabel} htmlFor="meta-building">Здание</label>
          <input
            id="meta-building"
            type="text"
            className={styles.metaInput}
            placeholder="> Главный корпус"
            value={data.building}
            onChange={(e) => handleChange('building', e.target.value)}
          />
        </div>

        <div className={styles.metaRow}>
          <div className={styles.field}>
            <label className={styles.metaLabel} htmlFor="meta-floor">Этаж</label>
            <input
              id="meta-floor"
              type="text"
              className={styles.metaInput}
              placeholder="> 1"
              value={data.floor}
              onChange={(e) => handleChange('floor', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.metaLabel} htmlFor="meta-wing">Крыло</label>
            <input
              id="meta-wing"
              type="text"
              className={styles.metaInput}
              placeholder="> А"
              value={data.wing}
              onChange={(e) => handleChange('wing', e.target.value)}
            />
          </div>
        </div>
      </div>
    </form>
  );
};
