import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/apiService';

export default function NavBar() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (e) {
      // Ignore errors on logout
    } finally {
      navigate('/login');
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <Link to="/">Diplom3D</Link>
        </div>
        
        <div className="navbar-menu">
           <Link to="/reconstructions" className="navbar-link">Мои проекты</Link>
           <Link to="/reconstructions/add" className="navbar-link active">Создать +</Link>
           
           <div className="navbar-divider"></div>
           
           <button onClick={handleLogout} className="navbar-btn-logout">
             Выход
           </button>
        </div>
      </div>
    </nav>
  );
}
