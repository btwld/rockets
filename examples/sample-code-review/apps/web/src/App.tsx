import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/auth-context';
import { AuthGuard } from './auth/auth-guard';
import { GuestGuard } from './auth/guest-guard';
import { DashboardPage } from './pages/DashboardPage';
import { GithubCallbackPage } from './pages/GithubCallbackPage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportPage } from './pages/ReportPage';

function Protected({ children }: { readonly children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestGuard>
                <LoginPage />
              </GuestGuard>
            }
          />
          <Route
            path="/auth/github/callback"
            element={<GithubCallbackPage />}
          />
          <Route
            path="/"
            element={
              <Protected>
                <DashboardPage />
              </Protected>
            }
          />
          <Route
            path="/profile"
            element={
              <Protected>
                <ProfilePage />
              </Protected>
            }
          />
          <Route
            path="/reports/:reportId"
            element={
              <Protected>
                <ReportPage />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
