import React, { useEffect, useState } from 'react';
import {
  CreditCard, CheckCircle, Clock, AlertCircle, ArrowRight,
  DollarSign, Send, Check, X, Shield, RefreshCw, FileText
} from 'lucide-react';
import { settlementService } from '../../services/settlementService';
import type { Settlement } from '../../types';
import { formatCurrency, formatDate, formatDateTime, getPaymentStatusConfig } from '../../utils/formatters';
import toast from 'react-hot-toast';

interface EligibleClaim {
  id: string;
  claim_number: string;
  customer_name: string;
  policy_number: string;
  incident_type: string;
  approved_amount: number;
  approved_at?: string;
}

const SettlementsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ELIGIBLE' | 'SETTLEMENTS'>('ELIGIBLE');
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [eligibleClaims, setEligibleClaims] = useState<EligibleClaim[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State for Initiating Settlement on an Approved Claim
  const [selectedClaim, setSelectedClaim] = useState<EligibleClaim | null>(null);
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('NEFT');
  const [bankAccount, setBankAccount] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [immediateDisburse, setImmediateDisburse] = useState<boolean>(true);
  const [submittingPayout, setSubmittingPayout] = useState<boolean>(false);

  // Action state for existing settlement
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [settlementsRes, eligibleRes] = await Promise.all([
        settlementService.listSettlements({ page_size: 100 }),
        settlementService.getEligibleClaims().catch(() => []),
      ]);
      setSettlements(settlementsRes.settlements);
      setEligibleClaims(eligibleRes);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load settlement data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openInitiateModal = (claim: EligibleClaim) => {
    setSelectedClaim(claim);
    setPayoutAmount(claim.approved_amount.toString());
    setPaymentMethod('NEFT');
    setBankAccount('HDFC0001234 - 501002348911');
    setPaymentReference(`UTR-${Date.now().toString().slice(-8)}`);
    setImmediateDisburse(true);
  };

  const handleInitiateSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) return;
    const amt = parseFloat(payoutAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid payout amount');
      return;
    }

    setSubmittingPayout(true);
    try {
      // 1. Create Settlement
      const created = await settlementService.createSettlement({
        claim_id: selectedClaim.id,
        payment_amount: amt,
        payment_method: paymentMethod,
        bank_account: bankAccount,
      });

      // 2. If immediate disburse is checked, complete it right away
      if (immediateDisburse) {
        if (paymentReference) {
          await settlementService.updateSettlement(created.id, {
            payment_reference: paymentReference,
          });
        }
        await settlementService.completeSettlement(created.id);
        toast.success(`Settlement disbursed and confirmed for Claim ${selectedClaim.claim_number}!`);
      } else {
        if (paymentReference) {
          await settlementService.updateSettlement(created.id, {
            payment_reference: paymentReference,
          });
        }
        toast.success(`Settlement created as Pending for Claim ${selectedClaim.claim_number}.`);
      }

      setSelectedClaim(null);
      await fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Settlement creation failed');
    } finally {
      setSubmittingPayout(false);
    }
  };

  const handleCompletePayout = async (id: string) => {
    setProcessingId(id);
    try {
      await settlementService.completeSettlement(id);
      toast.success('Funds disbursed and payment completed!');
      await fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to complete payout');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading settlement records...</span>
      </div>
    );
  }

  const pending = settlements.filter((s) => s.payment_status === 'PENDING' || s.payment_status === 'PROCESSING');
  const completed = settlements.filter((s) => s.payment_status === 'COMPLETED');
  const totalDisbursed = completed.reduce((acc, s) => acc + s.payment_amount, 0);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Claims Settlement & Payout Processing</h1>
          <p className="page-subtitle">Disburse approved claim funds, verify banking transactions, and reconcile settlements</p>
        </div>
        <button onClick={fetchData} className="btn btn-secondary btn-sm" title="Refresh">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Eligible for Settlement</span>
            <div className="stat-card-icon blue"><Clock size={20} /></div>
          </div>
          <div className="stat-card-value">{eligibleClaims.length}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Pending Disbursements</span>
            <div className="stat-card-icon yellow"><CreditCard size={20} /></div>
          </div>
          <div className="stat-card-value">{pending.length}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Completed Settlements</span>
            <div className="stat-card-icon green"><CheckCircle size={20} /></div>
          </div>
          <div className="stat-card-value">{completed.length}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Capital Disbursed</span>
            <div className="stat-card-icon purple"><DollarSign size={20} /></div>
          </div>
          <div className="stat-card-value">{formatCurrency(totalDisbursed)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('ELIGIBLE')}
          className={`btn ${activeTab === 'ELIGIBLE' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Approved Claims Awaiting Payout ({eligibleClaims.length})
        </button>
        <button
          onClick={() => setActiveTab('SETTLEMENTS')}
          className={`btn ${activeTab === 'SETTLEMENTS' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Settlement Records & History ({settlements.length})
        </button>
      </div>

      {/* TAB 1: ELIGIBLE APPROVED CLAIMS */}
      {activeTab === 'ELIGIBLE' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Claims Ready for Payment Processing</div>
              <div className="card-subtitle">Approved by claim officers, pending disbursement</div>
            </div>
          </div>

          {eligibleClaims.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><CheckCircle size={32} /></div>
              <div className="empty-state-title">No Pending Approvals</div>
              <div className="empty-state-text">
                All approved claims have been settled. When officers approve new claims, they will appear here automatically.
              </div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Claim ID</th>
                    <th>Customer</th>
                    <th>Policy</th>
                    <th>Incident</th>
                    <th>Approved Amount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {eligibleClaims.map((claim) => (
                    <tr key={claim.id}>
                      <td>
                        <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)' }}>
                          {claim.claim_number}
                        </code>
                      </td>
                      <td><strong>{claim.customer_name || 'Customer'}</strong></td>
                      <td>#{claim.policy_number || 'N/A'}</td>
                      <td>{claim.incident_type}</td>
                      <td style={{ fontWeight: 700, color: 'var(--success)', fontSize: 15 }}>
                        {formatCurrency(claim.approved_amount)}
                      </td>
                      <td>
                        <button
                          onClick={() => openInitiateModal(claim)}
                          className="btn btn-primary btn-sm"
                          style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
                        >
                          <Send size={13} /> Initiate Payout
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SETTLEMENT RECORDS */}
      {activeTab === 'SETTLEMENTS' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Settlement Audit Log</div>
              <div className="card-subtitle">Complete ledger of electronic wire transfers and payouts</div>
            </div>
          </div>

          {settlements.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><CreditCard size={32} /></div>
              <div className="empty-state-title">No Settlements Found</div>
              <div className="empty-state-text">No payment records currently in the system.</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Settlement ID</th>
                    <th>Claim Number</th>
                    <th>Customer</th>
                    <th>Approved Amount</th>
                    <th>Payout Amount</th>
                    <th>Method</th>
                    <th>Transaction Ref</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => {
                    const statusConfig = getPaymentStatusConfig(s.payment_status);
                    return (
                      <tr key={s.id}>
                        <td><code style={{ fontSize: 11 }}>{s.id.slice(0, 8)}...</code></td>
                        <td>
                          <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-light)' }}>
                            {s.claim_number ?? s.claim_id.slice(0, 8)}
                          </code>
                        </td>
                        <td>{s.customer_name || 'Customer'}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(s.approved_amount)}</td>
                        <td style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(s.payment_amount)}</td>
                        <td>{s.payment_method || 'NEFT'}</td>
                        <td>
                          <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {s.payment_reference || 'Pending'}
                          </code>
                        </td>
                        <td>
                          <span className={`badge ${statusConfig.className}`}>{statusConfig.label}</span>
                        </td>
                        <td>
                          {s.payment_status !== 'COMPLETED' ? (
                            <button
                              onClick={() => handleCompletePayout(s.id)}
                              className="btn btn-primary btn-sm"
                              disabled={processingId === s.id}
                              style={{ background: 'var(--success)', borderColor: 'transparent' }}
                            >
                              {processingId === s.id ? 'Processing...' : 'Disburse Funds'}
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle size={14} /> Confirmed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: INITIATE SETTLEMENT */}
      {selectedClaim && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h3 className="modal-title">Initiate Claim Settlement Payout</h3>
              <button onClick={() => setSelectedClaim(null)} className="modal-close">&times;</button>
            </div>
            <form onSubmit={handleInitiateSettlement}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Claim Number:</span>
                    <strong>{selectedClaim.claim_number}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                    <strong>{selectedClaim.customer_name || 'Customer'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Approved Coverage:</span>
                    <strong style={{ color: 'var(--success)' }}>{formatCurrency(selectedClaim.approved_amount)}</strong>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label required">Payout Amount (₹)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    min="1"
                    step="100"
                    required
                  />
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label required">Payment Method</label>
                    <select
                      className="form-select"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                      <option value="NEFT">NEFT (Electronic Transfer)</option>
                      <option value="RTGS">RTGS (High Value Transfer)</option>
                      <option value="IMPS">IMPS (Immediate Transfer)</option>
                      <option value="UPI">UPI Automated Payout</option>
                      <option value="BANK_CHEQUE">Demand Draft / Cheque</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label required">Transaction Reference / UTR</label>
                    <input
                      type="text"
                      className="form-input"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="e.g. UTR-98234821"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Beneficiary Bank Account Details</label>
                  <input
                    type="text"
                    className="form-input"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="Bank IFSC & Account Number"
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                    Secured using AES-256 field-level encryption on database storage.
                  </span>
                </div>

                <div style={{ padding: 12, background: 'rgba(16, 185, 129, 0.08)', borderRadius: 'var(--radius)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={immediateDisburse}
                      onChange={(e) => setImmediateDisburse(e.target.checked)}
                      style={{ accentColor: 'var(--success)', width: 16, height: 16 }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                      <strong>Confirm & Mark Completed Immediately</strong> (Customer will receive settlement notification)
                    </span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setSelectedClaim(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: 'var(--success)', borderColor: 'var(--success)' }}
                  disabled={submittingPayout}
                >
                  {submittingPayout ? 'Processing...' : 'Disburse & Settle Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettlementsPage;
