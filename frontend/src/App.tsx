import { Routes, Route, useLocation } from 'react-router-dom'

// Components
import NavBar from './components/NavBar'

// Pages (заглушки)
import HomePage from './pages/HomePage'
import AddReconstructionPage from './pages/AddReconstructionPage'
import ReconstructionsListPage from './pages/ReconstructionsListPage'
import ViewMeshPage from './pages/ViewMeshPage'
import LoginPage from './pages/LoginPage'

// Layout wrapper
const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  // Hide navbar on login page
  const hideNav = location.pathname === '/login';
  
  return (
    <>
      {!hideNav && <NavBar />}
      {children}
    </>
  );
};

function App() {
  return (
    <div className="app">
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reconstructions" element={<ReconstructionsListPage />} />
          <Route path="/reconstructions/add" element={<AddReconstructionPage />} />
          <Route path="/mesh/:id" element={<ViewMeshPage />} />
        </Routes>
      </Layout>
    </div>
  )
}

export default App
