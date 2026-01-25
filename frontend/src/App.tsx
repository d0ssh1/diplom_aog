import { Routes, Route } from 'react-router-dom'

// Pages (заглушки)
import HomePage from './pages/HomePage'
import AddReconstructionPage from './pages/AddReconstructionPage'
import ReconstructionsListPage from './pages/ReconstructionsListPage'
import ViewMeshPage from './pages/ViewMeshPage'
import LoginPage from './pages/LoginPage'

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reconstructions" element={<ReconstructionsListPage />} />
        <Route path="/reconstructions/add" element={<AddReconstructionPage />} />
        <Route path="/mesh/:id" element={<ViewMeshPage />} />
      </Routes>
    </div>
  )
}

export default App
