import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Shield, Bell, User, LogOut,
  FileCheck, AlertTriangle, Settings, Users, BarChart3,
  CreditCard, ClipboardList, Home
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getInitials, getRoleLabel } from '../../utils/formatters';
import toast from 'react-hot-toast';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

const customerNav: NavItem[] = [
  { label: 'Dashboard',    path: '/customer/dashboard',      icon: LayoutDashboard },
  { label: 'My Policies',  path: '/customer/policies',       icon: Shield },
  { label: 'My Claims',    path: '/customer/claims',         icon: FileText },
  { label: 'Notifications',path: '/customer/notifications',  icon: Bell },
  { label: 'Profile',      path: '/customer/profile',        icon: User },
];

const officerNav: NavItem[] = [
  { label: 'Dashboard',    path: '/officer/dashboard',  icon: LayoutDashboard },
  { label: 'Assigned Claims',path: '/officer/claims',   icon: FileText },
  { label: 'Fraud Alerts', path: '/officer/fraud-alerts',icon: AlertTriangle },
];

const adminNav: NavItem[] = [
  { label: 'Dashboard',        path: '/admin/dashboard',         icon: LayoutDashboard },
  { label: 'Users',            path: '/admin/users',             icon: Users },
  { label: 'Policies',         path: '/admin/policies',          icon: Shield },
  { label: 'Claims',           path: '/admin/claims',            icon: FileText },
  { label: 'Fraud Monitoring', path: '/admin/fraud-monitoring',  icon: AlertTriangle },
  { label: 'Settlements',      path: '/admin/settlements',       icon: CreditCard },
  { label: 'Analytics',        path: '/admin/analytics',         icon: BarChart3 },
  { label: 'Audit Logs',       path: '/admin/audit-logs',        icon: ClipboardList },
  { label: 'Settings',         path: '/admin/settings',          icon: Settings },
];

const navByRole: Record<string, NavItem[]> = {
  CUSTOMER:      customerNav,
  CLAIM_OFFICER: officerNav,
  ADMIN:         adminNav,
};

const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;
  const navItems = navByRole[user.role] ?? customerNav;

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
      toast.success('Logged out successfully');
    } catch {
      navigate('/login');
    }
  };

  return (
    <aside className="app-sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🛡️</div>
        <div>
          <div className="sidebar-logo-text">InsureClaim</div>
          <div className="sidebar-logo-sub">AI Platform</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-link${isActive ? ' active' : ''}`
            }
          >
            <item.icon className="icon" size={17} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User Footer */}
      <div className="sidebar-user">
        <div className="sidebar-user-avatar">
          {getInitials(user.full_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sidebar-user-name truncate">{user.full_name}</div>
          <div className="sidebar-user-role">{getRoleLabel(user.role)}</div>
        </div>
        <button
          className="btn-ghost btn-icon"
          onClick={handleLogout}
          title="Logout"
          style={{ flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)', padding: '6px', background: 'transparent', color: 'var(--text-muted)' }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
