import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/apiService';
import { Button } from '../components/UI/Button';
import styles from './LoginPage.module.css';
import buildingIsometric from '../assets/building-isometric.png';

interface LoginResponse {
  auth_token: string;
}

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Заполните все поля');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await authApi.login(username, password);
      const data = result as LoginResponse;
      localStorage.setItem('auth_token', data.auth_token);
      navigate('/');
    } catch {
      setError('Неверный логин или пароль');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <img
          src={buildingIsometric}
          alt="Building"
          className={styles.illustration}
        />
      </div>
      <div className={styles.right}>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <h1 className={styles.title}>Вход в систему</h1>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="username">
              Логин
            </label>
            <input
              id="username"
              type="text"
              className={`${styles.input} ${error ? styles.inputError : ''}`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              className={`${styles.input} ${error ? styles.inputError : ''}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <Button variant="secondary" type="submit" disabled={isLoading}>
            {isLoading ? 'Загрузка...' : 'Войти'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
