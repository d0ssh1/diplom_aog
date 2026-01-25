/**
 * Страница авторизации
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/apiService';

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [rePassword, setRePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      setError('Заполните все поля');
      return;
    }

    if (isRegister && password !== rePassword) {
        setError('Пароли не совпадают');
        return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isRegister) {
          await authApi.register({ username, password, re_password: rePassword });
          // Auto login after register? Or ask to login?
          // Let's auto login 
          const response = await authApi.login(username, password);
          localStorage.setItem('auth_token', response.auth_token);
      } else {
          const response = await authApi.login(username, password);
          localStorage.setItem('auth_token', response.auth_token);
      }
      navigate('/reconstructions');
    } catch (err: any) {
      if (isRegister) {
          setError(err.response?.data?.detail || 'Ошибка регистрации');
      } else {
          setError('Неверный логин или пароль');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <main className="login-container">
        <h1>{isRegister ? 'Регистрация' : 'Вход в систему'}</h1>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Логин</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите логин"
              disabled={loading}
              minLength={4}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              disabled={loading}
              minLength={username === 'admin' ? 1 : 8}
            />
          </div>

          {isRegister && (
             <div className="form-group">
                <label htmlFor="rePassword">Повторите пароль</label>
                <input
                  id="rePassword"
                  type="password"
                  value={rePassword}
                  onChange={(e) => setRePassword(e.target.value)}
                  placeholder="Повторите пароль"
                  disabled={loading}
                  minLength={8}
                />
            </div>
          )}
          
          {error && <div className="error-message">{error}</div>}
          
          <button type="submit" disabled={loading} className="btn-login">
            {loading ? 'Загрузка...' : (isRegister ? 'Зарегистрироваться' : 'Войти')}
          </button>
        </form>

        <div className="auth-switch">
            <p>
                {isRegister ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
                <button 
                    type="button" 
                    onClick={() => {
                        setIsRegister(!isRegister);
                        setError(null);
                        setPassword('');
                        setRePassword('');
                    }}
                    style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline' }}
                >
                    {isRegister ? 'Войти' : 'Зарегистрироваться'}
                </button>
            </p>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
