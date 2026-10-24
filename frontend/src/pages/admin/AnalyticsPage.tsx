import React, { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, CheckCircle, XCircle, Clock, Download } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { analyticsService, downloadBlob } from '../../services/analyticsService';
import type { ClaimsAnalytics, DashboardStats } from '../../types';
import toast from 'react-hot-toast';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const AnalyticsPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [claimsData, setClaimsData] = useState<ClaimsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExportClaims = async () => {
    try {
      setExporting('claims');
      const blob = await analyticsService.exportClaimsCsv();
      downloadBlob(blob, `claims_report_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('Claims report exported successfully');
    } catch (err) {
      toast.error('Failed to export claims report');
    } finally {
      setExporting(null);
    }
  };

  const handleExportSettlements = async () => {
    try {
      setExporting('settlements');
      const blob = await analyticsService.exportSettlementsCsv();
      downloadBlob(blob, `settlements_report_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('Settlements report exported successfully');
    } catch (err) {
      toast.error('Failed to export settlements report');
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashStats, claimsStats] = await Promise.all([
          analyticsService.getDashboardStats(),
          analyticsService.getClaimsAnalytics(),
        ]);
        setStats(dashStats);
        setClaimsData(claimsStats);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading analytics graphs...</span>
      </div>
    );
  }

  const statusPieData = (claimsData?.claims_by_status ?? []).map((item) => ({
    name: item.status.replace(/_/g, ' '),
    value: item.count,
  }));

  const typeBarData = claimsData?.claims_by_type ?? [];
  const monthlyData = claimsData?.claims_by_month ?? [];

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Claims Analytics & Performance</h1>
          <p className="page-subtitle">Real-time throughput, status distribution, and risk metrics</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleExportClaims}
            disabled={exporting !== null}
            className="btn btn-secondary"
            title="Download CSV report of all claims"
          >
            <Download size={15} />
            {exporting === 'claims' ? 'Exporting...' : 'Export Claims (CSV)'}
          </button>
          <button
            onClick={handleExportSettlements}
            disabled={exporting !== null}
            className="btn btn-secondary"
            title="Download CSV report of financial settlements"
          >
            <Download size={15} />
            {exporting === 'settlements' ? 'Exporting...' : 'Export Settlements (CSV)'}
          </button>
        </div>
      </div>

      {/* Ratios row */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Approval Rate</span>
            <div className="stat-card-icon green"><CheckCircle size={20} /></div>
          </div>
          <div className="stat-card-value">
            {claimsData ? `${claimsData.approval_rate.toFixed(1)}%` : '0%'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Rejection Rate</span>
            <div className="stat-card-icon red"><XCircle size={20} /></div>
          </div>
          <div className="stat-card-value">
            {claimsData ? `${claimsData.rejection_rate.toFixed(1)}%` : '0%'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Avg. Turnaround</span>
            <div className="stat-card-icon blue"><Clock size={20} /></div>
          </div>
          <div className="stat-card-value">
            {claimsData ? `${claimsData.avg_processing_days.toFixed(1)} days` : '—'}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Status Distribution Pie Chart */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Claims Status Distribution</div>
          </div>
          <div style={{ height: 280 }}>
            {statusPieData.length === 0 ? (
              <div className="empty-state" style={{ height: '100%' }}>No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusPieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                    itemStyle={{ color: 'var(--text-primary)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 12 }}>
            {statusPieData.map((item, idx) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[idx % COLORS.length] }} />
                <span style={{ color: 'var(--text-secondary)' }}>{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Incident Type Bar Chart */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Claims by Incident Type</div>
          </div>
          <div style={{ height: 280 }}>
            {typeBarData.length === 0 ? (
              <div className="empty-state" style={{ height: '100%' }}>No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeBarData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="type" stroke="var(--text-muted)" fontSize={11} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                    itemStyle={{ color: 'var(--text-primary)' }}
                  />
                  <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Trend Chart */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Monthly Claims Submissions Trend</div>
        </div>
        <div style={{ height: 260 }}>
          {monthlyData.length === 0 ? (
            <div className="empty-state" style={{ height: '100%' }}>No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
