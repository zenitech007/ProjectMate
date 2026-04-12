
import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Layout/Navbar';
import LandingPage from './components/Landing/LandingPage';
import AuthPage from './components/Auth/AuthPage';
import Dashboard from './components/Dashboard/Dashboard';
import ProjectWizard from './components/ProjectWizard/ProjectWizard';
import ProjectEditor from './components/Editor/ProjectEditor';
import UpgradePage from './components/Premium/UpgradePage';
import { useAuth } from './context/AuthContext';
import ErrorBoundary from './components/Layout/ErrorBoundary';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-green-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-700" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const { user, logout, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-green-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-700" />
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar user={user} onLogout={logout} />
        <main className="grow">
          <Routes>
            {/* Logged-in users go straight to dashboard; guests see landing page */}
            <Route
              path="/"
              element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />}
            />
            {/* Auth page redirects to dashboard if already logged in */}
            <Route
              path="/auth"
              element={!user ? <AuthPage /> : <Navigate to="/dashboard" replace />}
            />
            <Route path="/dashboard" element={
              <ProtectedRoute><Dashboard user={user!} /></ProtectedRoute>
            } />
            <Route path="/wizard" element={
              <ProtectedRoute><ProjectWizard user={user!} /></ProtectedRoute>
            } />
            <Route path="/editor/:projectId" element={
              <ProtectedRoute><ProjectEditor user={user!} /></ProtectedRoute>
            } />
            <Route path="/upgrade" element={
              <ProtectedRoute><UpgradePage user={user!} /></ProtectedRoute>
            } />
            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AppContent />
  </ErrorBoundary>
);

export default App;
