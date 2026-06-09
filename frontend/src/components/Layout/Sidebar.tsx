import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../../api/apiService';
import styles from './Sidebar.module.css';

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [canApproveUsers, setCanApproveUsers] = useState(false);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const user = await authApi.getMe();
        setCanApproveUsers(user.is_superuser || user.can_approve_users);
      } catch (err) {
        console.error('Failed to fetch user permissions:', err);
      }
    };
    checkPermissions();
  }, []);

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside className={styles.sidebar}>
      <h2 className={styles.title}>{'// Меню'}</h2>
      <nav className={styles.nav}>
        <button
          className={`${styles.item} ${isActive('/admin') ? styles.active : ''}`}
          onClick={() => navigate('/admin')}
          type="button"
        >
          <span className={styles.arrow}>&gt;</span> Редактировать план
        </button>
        
        <button
          className={`${styles.item} ${isActive('/admin/buildings') ? styles.active : ''}`}
          onClick={() => navigate('/admin/buildings')}
          type="button"
        >
          <span className={styles.arrow}>&gt;</span> Корпуса и этажи
        </button>
        <button
          className={`${styles.item} ${isActive('/admin/floor-editor') ? styles.active : ''}`}
          onClick={() => navigate('/admin/floor-editor')}
          type="button"
        >
          <span className={styles.arrow}>&gt;</span> Редактор отсеков
        </button>
        <button
          className={`${styles.item} ${isActive('/admin/vertical-stitching') ? styles.active : ''}`}
          onClick={() => navigate('/admin/vertical-stitching')}
          type="button"
        >
          <span className={styles.arrow}>&gt;</span> Вертикальное сшивание
        </button>
        <button
          className={`${styles.item} ${isActive('/admin/3d-routes') ? styles.active : ''}`}
          onClick={() => navigate('/admin/3d-routes')}
          type="button"
        >
          <span className={styles.arrow}>&gt;</span> 3D-маршруты
        </button>
        <button
          className={`${styles.item} ${isActive('/admin/transitions') ? styles.active : ''}`}
          onClick={() => navigate('/admin/transitions')}
          type="button"
        >
          <span className={styles.arrow}>&gt;</span> Переходы между планами
        </button>
        <button
          className={`${styles.item} ${isActive('/admin/route-test') ? styles.active : ''}`}
          onClick={() => navigate('/admin/route-test')}
          type="button"
        >
          <span className={styles.arrow}>&gt;</span> Тестовый маршрут
        </button>
        {canApproveUsers && (
          <button
            className={`${styles.item} ${isActive('/admin/pending-users') ? styles.active : ''}`}
            onClick={() => navigate('/admin/pending-users')}
            type="button"
          >
            <span className={styles.arrow}>&gt;</span> Подтверждение учетной записи
          </button>
        )}
      </nav>
    </aside>
  );
};
