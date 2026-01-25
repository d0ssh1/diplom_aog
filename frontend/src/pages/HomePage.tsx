/**
 * Главная страница приложения
 */

import { Link } from 'react-router-dom';

function HomePage() {
  return (
    <div className="home-page">
      <header className="header">
        <h1>Diplom3D</h1>
        <p>Построение виртуальных карт зданий</p>
      </header>
      
      <main className="main-content">
        <section className="hero">
          <h2>Система внутренней навигации</h2>
          <p>
            Автоматическое построение 3D-моделей этажей 
            на основе планов эвакуации с функцией поиска маршрутов
          </p>
        </section>
        
        <nav className="navigation-cards">
          <Link to="/reconstructions" className="nav-card">
            <h3>📋 Реконструкции</h3>
            <p>Просмотр созданных 3D-моделей</p>
          </Link>
          
          <Link to="/reconstructions/add" className="nav-card">
            <h3>➕ Создать</h3>
            <p>Добавить новую реконструкцию</p>
          </Link>
          
          <Link to="/login" className="nav-card">
            <h3>🔐 Войти</h3>
            <p>Авторизация администратора</p>
          </Link>
        </nav>
      </main>
      
      <footer className="footer">
        <p>ДВФУ • 2025</p>
      </footer>
    </div>
  );
}

export default HomePage;
