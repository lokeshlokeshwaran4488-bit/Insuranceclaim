import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="loading-center" style={{ minHeight: '60vh' }}>
        <div className="spinner" />
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Authenticating...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to their default dashboard
    const defaultRoute: Record<UserRole, string> = {
      CUSTOMER: '/customer/dashboard',
      CLAIM_OFFICER: '/officer/dashboard',
      ADMIN: '/admin/dashboard',
    };
    return <Navigate to={defaultRoute[user.role] ?? '/login'} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
