import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Sidebar.module.css';

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();

  return (
    <aside className={styles.sidebar}>
      <h2 className={styles.title}>{'// Меню'}</h2>
      <nav className={styles.nav}>
        <button className={styles.item} onClick={() => navigate('/upload')} type="button">
          <span className={styles.arrow}>&gt;</span> Загрузить изображение
        </button>
        <button className={styles.item} onClick={() => navigate('/upload')} type="button">
          <span className={styles.arrow}>&gt;</span> Редактировать план помещения
        </button>
        <button className={styles.item} type="button" disabled>
          <span className={styles.arrow}>&gt;</span> Редактировать узловые точки
        </button>
        <button className={styles.item} type="button" disabled>
          <span className={styles.arrow}>&gt;</span> Удалить план помещения
        </button>
      </nav>
    </aside>
  );
};
