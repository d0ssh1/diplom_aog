import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/Layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { PublicHomePage } from './pages/PublicHomePage';
import { DashboardPage } from './pages/DashboardPage';
import { WizardPage } from './pages/WizardPage';
import { ViewMeshPage } from './pages/ViewMeshPage';
import { PendingUsersPage } from './pages/PendingUsersPage';
import { StitchingPage } from './pages/StitchingPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicHomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/admin" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="mesh/:id" element={<ViewMeshPage />} />
        <Route path="pending-users" element={<PendingUsersPage />} />
        <Route path="stitching" element={<StitchingPage />} />
      </Route>
      <Route path="/upload" element={<WizardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
