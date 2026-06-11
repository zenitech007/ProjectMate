
import React, { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Navbar from './components/Layout/Navbar';
import OfflineBanner from './components/Layout/OfflineBanner';
import InstallPrompt from './components/PwaInstall/InstallPrompt';
import { useAuth } from './context/AuthContext';
import { UserProfile } from './types';
import ErrorBoundary from './components/Layout/ErrorBoundary';

// ── Lazy-loaded routes ────────────────────────────────────────────────────────
// Each page is split into its own chunk. The browser only downloads a chunk
// when the user first navigates to that route — not on initial load.
//
// BEFORE: Everything in one 2.2 MB chunk → user waits for TipTap, docx, jsPDF
//         even on the landing page.
// AFTER:  Landing/Auth/Dashboard load instantly (~200 kB). The heavy editor
//         chunk (~900 kB) only downloads when the user opens a project.
const LandingPage = lazy(() => import('./components/Landing/LandingPage'));
const AuthPage = lazy(() => import('./components/Auth/AuthPage'));
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const ProjectWizard = lazy(() => import('./components/ProjectWizard/ProjectWizard'));
const ProjectEditor = lazy(() => import('./components/Editor/ProjectEditor'));
const UpgradePage = lazy(() => import('./components/Premium/UpgradePage'));
// Legal pages — public, single chunk
const TermsOfService = lazy(() => import('./components/Legal/LegalPages').then(m => ({ default: m.TermsOfService })));
const PrivacyPolicy = lazy(() => import('./components/Legal/LegalPages').then(m => ({ default: m.PrivacyPolicy })));
const RefundPolicy = lazy(() => import('./components/Legal/LegalPages').then(m => ({ default: m.RefundPolicy })));

// ── Route-level loading fallback ──────────────────────────────────────────────
// Shown while the lazy chunk is downloading. Keeps the Navbar visible
// so the page doesn't look blank.
const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-700" />
  </div>
);

// ── Auth guard ────────────────────────────────────────────────────────────────
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

// Re-mount the editor when the projectId changes so any in-flight stream
// from the previous project is aborted by its unmount cleanup.
const ProjectEditorRoute: React.FC<{ user: UserProfile }> = ({ user }) => {
  const { projectId } = useParams<{ projectId: string }>();
  return <ProjectEditor key={projectId} user={user} />;
};

// ── App shell ─────────────────────────────────────────────────────────────────
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
        <OfflineBanner />
        <InstallPrompt />
        <main className="grow">
          {/* Suspense boundary: shows PageLoader while any lazy chunk loads */}
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route
                path="/"
                element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />}
              />
              <Route
                path="/auth"
                element={!user ? <AuthPage /> : <Navigate to="/dashboard" replace />}
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    {user && <Dashboard user={user} />}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/wizard"
                element={
                  <ProtectedRoute>
                    {user && <ProjectWizard user={user} />}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/editor/:projectId"
                element={
                  <ProtectedRoute>
                    {/* key forces re-mount on projectId change so the editor's
                        unmount cleanup aborts any in-flight stream tied to the
                        previous project. */}
                    {user && <ProjectEditorRoute user={user} />}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/upgrade"
                element={
                  <ProtectedRoute>
                    {user && <UpgradePage user={user} />}
                  </ProtectedRoute>
                }
              />
              {/* Legal pages — public, accessible without sign-in */}
              <Route path="/legal/terms" element={<TermsOfService />} />
              <Route path="/legal/privacy" element={<PrivacyPolicy />} />
              <Route path="/legal/refund" element={<RefundPolicy />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
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
