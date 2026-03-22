import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './PendingUsersPage.module.css';

interface User {
  id: number;
  username: string;
  email: string | null;
  date_joined: string;
  is_active: boolean;
}

export const PendingUsersPage: React.FC = () => {
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await fetch('/api/v1/users/pending/', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 403) {
        setError('Недостаточно прав для просмотра этой страницы');
        return;
      }

      if (!response.ok) {
        throw new Error('Ошибка загрузки списка пользователей');
      }

      const data = await response.json();
      setPendingUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: number) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await fetch(`/api/v1/users/${userId}/approve/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Ошибка подтверждения пользователя');
      }

      // Обновляем список после подтверждения
      setPendingUsers(prev => prev.filter(user => user.id !== userId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка подтверждения');
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
        <button onClick={() => navigate('/dashboard')} className={styles.backButton}>
          Вернуться на главную
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Подтверждение учетной записи</h1>

      {pendingUsers.length === 0 ? (
        <div className={styles.empty}>
          <p>Нет пользователей, ожидающих подтверждения</p>
        </div>
      ) : (
        <div className={styles.userList}>
          {pendingUsers.map(user => (
            <div key={user.id} className={styles.userCard}>
              <div className={styles.userInfo}>
                <div className={styles.username}>
                  <span className={styles.label}>Имя пользователя:</span>
                  <span className={styles.value}>{user.username}</span>
                </div>
                <div className={styles.email}>
                  <span className={styles.label}>Email:</span>
                  <span className={styles.value}>{user.email || 'Не указан'}</span>
                </div>
                <div className={styles.date}>
                  <span className={styles.label}>Дата регистрации:</span>
                  <span className={styles.value}>
                    {new Date(user.date_joined).toLocaleString('ru-RU')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleApprove(user.id)}
                className={styles.approveButton}
              >
                Подтвердить
              </button>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => navigate('/dashboard')} className={styles.backButton}>
        Назад
      </button>
    </div>
  );
};
