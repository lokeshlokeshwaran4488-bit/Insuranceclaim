import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { notificationService } from '../../services/notificationService';
import { formatRelativeTime } from '../../utils/formatters';
import type { Notification } from '../../types';

const pathLabels: Record<string, string> = {
  '/customer/dashboard': 'Dashboard',
  '/customer/policies': 'My Policies',
  '/customer/claims': 'My Claims',
  '/customer/claims/new': 'New Claim',
  '/customer/notifications': 'Notifications',
  '/customer/profile': 'Profile',
  '/officer/dashboard': 'Dashboard',
  '/officer/claims': 'Assigned Claims',
  '/officer/fraud-alerts': 'Fraud Alerts',
  '/admin/dashboard': 'Dashboard',
  '/admin/users': 'User Management',
  '/admin/policies': 'Policies',
  '/admin/claims': 'Claims',
  '/admin/fraud-monitoring': 'Fraud Monitoring',
  '/admin/settlements': 'Settlements',
  '/admin/analytics': 'Analytics',
  '/admin/audit-logs': 'Audit Logs',
  '/admin/settings': 'Settings',
};

const TopNav: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const bellRef = useRef<HTMLDivElement>(null);

  const currentLabel = pathLabels[location.pathname] ?? 'InsureClaim AI';

  useEffect(() => {
    if (!user) return;
    notificationService
      .getNotifications({ page_size: 5 })
      .then((res) => {
        setUnreadCount(res.unread_count);
        setNotifications(res.notifications);
      })
      .catch(() => {});
  }, [user, location.pathname]);

  const handleMarkRead = async (id: string) => {
    await notificationService.markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const handleBellClick = () => {
    setShowNotifs((v) => !v);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="app-topnav">
      {/* Breadcrumb */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>InsureClaim</span>
        <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {currentLabel}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Notification Bell */}
        <div className="notif-bell" ref={bellRef} style={{ position: 'relative' }}>
          <button
            className="btn btn-ghost btn-icon"
            onClick={handleBellClick}
            style={{ position: 'relative' }}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="notif-count">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {/* Dropdown */}
          {showNotifs && (
            <div
              style={{
                position: 'absolute',
                top: 44,
                right: 0,
                width: 340,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xl)',
                zIndex: 300,
              }}
            >
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>Notifications</span>
                <button
                  style={{ fontSize: 12, color: 'var(--primary-light)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => navigate('/customer/notifications')}
                >
                  View all
                </button>
              </div>

              {notifications.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No notifications
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      background: n.is_read ? 'transparent' : 'var(--primary-subtle)',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 10,
                    }}
                    onClick={() => handleMarkRead(n.id)}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        {formatRelativeTime(n.created_at)}
                      </div>
                    </div>
                    {!n.is_read && (
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--primary)', marginTop: 4, flexShrink: 0,
                      }} />
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopNav;
