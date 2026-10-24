import React, { useEffect, useState } from 'react';
import { ClipboardList, Shield, User, Clock } from 'lucide-react';
import { analyticsService } from '../../services/analyticsService';
import { formatDateTime } from '../../utils/formatters';

interface AuditLogItem {
  id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await analyticsService.getAuditLogs({ page_size: 50 });
        setLogs(res.logs || res.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading system audit logs...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Security & System Audit Trail</h1>
          <p className="page-subtitle">Immutable chronological record of decisions, logins, and claim actions</p>
        </div>
      </div>

      <div className="card">
        {logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><ClipboardList size={32} /></div>
            <div className="empty-state-title">No Audit Events Logged</div>
            <div className="empty-state-text">System events will appear here as users interact with claims.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Entity Type</th>
                  <th>Entity ID</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td><span style={{ fontSize: 12 }}>{formatDateTime(log.created_at)}</span></td>
                    <td>
                      <span className="badge badge-blue">{log.action}</span>
                    </td>
                    <td><span style={{ fontWeight: 600 }}>{log.entity_type}</span></td>
                    <td><code style={{ fontSize: 12 }}>{log.entity_id ? log.entity_id.slice(0, 8) + '...' : '—'}</code></td>
                    <td><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.ip_address || '127.0.0.1'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogsPage;
