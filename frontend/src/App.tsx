import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/common/ProtectedRoute';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Customer Pages
import CustomerDashboard from './pages/customer/CustomerDashboard';
import PoliciesPage from './pages/customer/PoliciesPage';
import ClaimsListPage from './pages/customer/ClaimsListPage';
import NewClaimPage from './pages/customer/NewClaimPage';
import ClaimDetailPage from './pages/customer/ClaimDetailPage';
import NotificationsPage from './pages/customer/NotificationsPage';
import ProfilePage from './pages/customer/ProfilePage';

// Officer Pages
import OfficerDashboard from './pages/officer/OfficerDashboard';
import OfficerClaimsPage from './pages/officer/OfficerClaimsPage';
import OfficerClaimDetailPage from './pages/officer/OfficerClaimDetailPage';
import FraudAlertsPage from './pages/officer/FraudAlertsPage';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import UsersPage from './pages/admin/UsersPage';
import AdminPoliciesPage from './pages/admin/AdminPoliciesPage';
import AdminClaimsPage from './pages/admin/AdminClaimsPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import SettlementsPage from './pages/admin/SettlementsPage';
import AuditLogsPage from './pages/admin/AuditLogsPage';

const App: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected App Routes */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        {/* Customer Routes */}
        <Route path="/customer/dashboard" element={<CustomerDashboard />} />
        <Route path="/customer/policies" element={<PoliciesPage />} />
        <Route path="/customer/claims" element={<ClaimsListPage />} />
        <Route path="/customer/claims/new" element={<NewClaimPage />} />
        <Route path="/customer/claims/:id" element={<ClaimDetailPage />} />
        <Route path="/customer/notifications" element={<NotificationsPage />} />
        <Route path="/customer/profile" element={<ProfilePage />} />

        {/* Officer Routes */}
        <Route
          path="/officer/dashboard"
          element={
            <ProtectedRoute allowedRoles={['CLAIM_OFFICER', 'ADMIN']}>
              <OfficerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/officer/claims"
          element={
            <ProtectedRoute allowedRoles={['CLAIM_OFFICER', 'ADMIN']}>
              <OfficerClaimsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/officer/claims/:id"
          element={
            <ProtectedRoute allowedRoles={['CLAIM_OFFICER', 'ADMIN']}>
              <OfficerClaimDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/officer/fraud-alerts"
          element={
            <ProtectedRoute allowedRoles={['CLAIM_OFFICER', 'ADMIN']}>
              <FraudAlertsPage />
            </ProtectedRoute>
          }
        />

        {/* Admin Routes */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/policies"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminPoliciesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/claims"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminClaimsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/fraud-monitoring"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <FraudAlertsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settlements"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <SettlementsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit-logs"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AuditLogsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Default Catch-all */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default App;
