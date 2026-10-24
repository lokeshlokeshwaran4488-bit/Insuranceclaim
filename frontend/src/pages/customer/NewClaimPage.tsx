import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Shield, AlertCircle, ArrowLeft, ArrowRight, CheckCircle2,
  Upload, FileText, Image, Trash2, Info, Sparkles, Check,
  Clock, MapPin, Calendar, DollarSign
} from 'lucide-react';
import { policyService } from '../../services/policyService';
import { claimService } from '../../services/claimService';
import { documentService } from '../../services/documentService';
import type { Policy } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getErrorMessage } from '../../services/api';
import toast from 'react-hot-toast';

const INCIDENT_TYPES = [
  'Motor Vehicle Collision',
  'Vehicle Theft or Vandalism',
  'Medical Hospitalization',
  'Property Fire Damage',
  'Water Damage / Flooding',
  'Travel Delay or Baggage Loss',
  'Personal Accident / Injury',
  'Other Casualty',
];

interface UploadedFileItem {
  id: string;
  file: File;
  previewUrl?: string;
  category: string;
  isImage: boolean;
}

const NewClaimPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedPolicyId = searchParams.get('policy_id');

  // Wizard Step: 1 = Policy, 2 = Incident, 3 = Documents (Optional), 4 = Review, 5 = Success
  const [step, setStep] = useState<number>(1);

  // Policies state
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(preselectedPolicyId || '');

  // Incident Details state
  const [incidentType, setIncidentType] = useState<string>(INCIDENT_TYPES[0]);
  const [incidentDate, setIncidentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [incidentTime, setIncidentTime] = useState<string>('14:30');
  const [incidentLocation, setIncidentLocation] = useState<string>('');
  const [requestedAmount, setRequestedAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  // Uploaded Files (Strictly Optional)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileItem[]>([]);

  // Review & Confirmation
  const [declarationAccepted, setDeclarationAccepted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');

  // Success State
  const [createdClaimId, setCreatedClaimId] = useState<string>('');
  const [createdClaimNumber, setCreatedClaimNumber] = useState<string>('');
  const [createdClaimStatus, setCreatedClaimStatus] = useState<string>('');

  useEffect(() => {
    const fetchActivePolicies = async () => {
      try {
        const res = await policyService.listPolicies({ status: 'ACTIVE' });
        setPolicies(res.policies);
        if (!selectedPolicyId && res.policies.length > 0) {
          setSelectedPolicyId(res.policies[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch active policies', err);
      } finally {
        setLoadingPolicies(false);
      }
    };
    fetchActivePolicies();
  }, []);

  const selectedPolicy = policies.find((p) => p.id === selectedPolicyId);

  // File handling
  const handleFileSelect = (files: FileList | null, defaultCategory: string) => {
    if (!files || files.length === 0) return;
    const newItems: UploadedFileItem[] = [];

    Array.from(files).forEach((file) => {
      // 10MB limit check
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`File "${file.name}" exceeds 10MB limit.`);
        return;
      }
      const isImg = file.type.startsWith('image/');
      const previewUrl = isImg ? URL.createObjectURL(file) : undefined;
      newItems.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        previewUrl,
        category: defaultCategory,
        isImage: isImg,
      });
    });

    setUploadedFiles((prev) => [...prev, ...newItems]);
    toast.success(`Attached ${newItems.length} file(s)`);
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const updateFileCategory = (id: string, category: string) => {
    setUploadedFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, category } : item))
    );
  };

  // Step Validations
  const validateStep1 = () => {
    if (!selectedPolicyId) {
      toast.error('Please select an active policy to continue.');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!requestedAmount || parseFloat(requestedAmount) <= 0) {
      toast.error('Please enter a valid requested claim amount.');
      return false;
    }
    if (selectedPolicy && parseFloat(requestedAmount) > selectedPolicy.coverage_amount) {
      toast.error(
        `Requested amount cannot exceed policy coverage of ${formatCurrency(
          selectedPolicy.coverage_amount
        )}`
      );
      return false;
    }
    if (!description.trim()) {
      toast.error('Please enter a description of the incident.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((prev) => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Final Submission
  const handleSubmitClaim = async () => {
    if (!declarationAccepted) {
      toast.error('Please confirm the accuracy declaration before submitting.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      // 1. Create Draft Claim
      const claim = await claimService.createClaim({
        policy_id: selectedPolicyId,
        incident_type: incidentType,
        incident_date: incidentDate,
        incident_time: incidentTime,
        incident_location: incidentLocation || undefined,
        requested_amount: parseFloat(requestedAmount),
        description,
      });

      // 2. Upload any optional files attached
      if (uploadedFiles.length > 0) {
        for (const item of uploadedFiles) {
          try {
            await documentService.uploadDocument(claim.id, item.file, item.category);
          } catch (uploadErr) {
            console.warn(`Failed to upload ${item.file.name}:`, uploadErr);
          }
        }
      }

      // 3. Submit Claim for Verification & AI Scoring
      const submitted = await claimService.submitClaim(claim.id);

      setCreatedClaimId(submitted.id);
      setCreatedClaimNumber(submitted.claim_number);
      setCreatedClaimStatus(
        uploadedFiles.length === 0
          ? 'Submitted — Documents May Be Requested'
          : submitted.status
      );

      setStep(5); // Show success screen
      toast.success('Claim successfully submitted!');
    } catch (err) {
      setSubmitError(getErrorMessage(err));
      toast.error('Claim submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPolicies) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading active policy details...</span>
      </div>
    );
  }

  // Success Screen (Step 5)
  if (step === 5) {
    return (
      <div style={{ maxWidth: 680, margin: '40px auto' }}>
        <div className="card" style={{ textAlign: 'center', padding: '40px 32px' }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.12)',
              color: 'var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <CheckCircle2 size={44} />
          </div>

          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            Claim Submitted Successfully!
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>
            Your insurance claim has been officially registered in the system.
          </p>

          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius)',
              padding: 20,
              marginBottom: 24,
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Claim Reference Number:</span>
              <strong style={{ fontFamily: 'monospace', fontSize: 16, color: 'var(--primary-light)' }}>
                {createdClaimNumber}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Initial Processing Status:</span>
              <span
                style={{
                  background: uploadedFiles.length === 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  color: uploadedFiles.length === 0 ? 'var(--warning)' : 'var(--primary-light)',
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {createdClaimStatus}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Claim Amount:</span>
              <strong style={{ fontSize: 14 }}>{formatCurrency(parseFloat(requestedAmount))}</strong>
            </div>
          </div>

          {uploadedFiles.length === 0 ? (
            <div
              style={{
                display: 'flex',
                gap: 12,
                padding: 16,
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 'var(--radius)',
                textAlign: 'left',
                marginBottom: 28,
              }}
            >
              <Info size={20} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--warning)', display: 'block', marginBottom: 2 }}>
                  Notice: No Initial Documents Attached
                </strong>
                Your claim will still be evaluated normally. If specific documentation (such as repair estimates or receipts) is required, the reviewing officer will post a document request with a deadline in your claim dashboard.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                gap: 12,
                padding: 16,
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--radius)',
                textAlign: 'left',
                marginBottom: 28,
              }}
            >
              <CheckCircle2 size={20} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--success)', display: 'block', marginBottom: 2 }}>
                  {uploadedFiles.length} Supporting File(s) Attached
                </strong>
                Files have been encrypted and queued for automated OCR document verification and officer review.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
            <button
              onClick={() => navigate('/customer/claims')}
              className="btn btn-secondary"
            >
              Back to My Claims
            </button>
            <button
              onClick={() => navigate(`/customer/claims/${createdClaimId}`)}
              className="btn btn-primary"
            >
              Track This Claim
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => (step === 1 ? navigate(-1) : handleBack())}
          className="btn btn-secondary btn-icon"
          title="Go back"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="page-title">File an Insurance Claim</h1>
          <p className="page-subtitle">Submit your incident details in 4 simple steps</p>
        </div>
      </div>

      {/* Step Indicator Wizard Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 32,
          position: 'relative',
          maxWidth: 820,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 18,
            left: 40,
            right: 40,
            height: 2,
            background: 'var(--border-color)',
            zIndex: 0,
          }}
        >
          <div
            style={{
              height: '100%',
              background: 'var(--primary)',
              width: `${((step - 1) / 3) * 100}%`,
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        {[
          { num: 1, label: 'Select Policy' },
          { num: 2, label: 'Incident Details' },
          { num: 3, label: 'Supporting Files (Optional)' },
          { num: 4, label: 'Review & Submit' },
        ].map((s) => {
          const isDone = step > s.num;
          const isCurrent = step === s.num;
          return (
            <div
              key={s.num}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 1,
                cursor: isDone ? 'pointer' : 'default',
              }}
              onClick={() => isDone && setStep(s.num)}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: isDone
                    ? 'var(--primary)'
                    : isCurrent
                    ? 'var(--bg-card)'
                    : 'var(--bg-elevated)',
                  border: isCurrent
                    ? '2px solid var(--primary)'
                    : isDone
                    ? 'none'
                    : '1px solid var(--border-color)',
                  color: isDone ? '#fff' : isCurrent ? 'var(--primary)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 8,
                  boxShadow: isCurrent ? '0 0 0 4px var(--primary-subtle)' : 'none',
                }}
              >
                {isDone ? <Check size={18} /> : s.num}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: isCurrent ? 600 : 500,
                  color: isCurrent
                    ? 'var(--text-primary)'
                    : isDone
                    ? 'var(--text-secondary)'
                    : 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {submitError && (
        <div className="alert alert-danger" style={{ marginBottom: 24, maxWidth: 820 }}>
          <AlertCircle size={18} />
          <span>{submitError}</span>
        </div>
      )}

      {/* Wizard Step Content */}
      <div style={{ maxWidth: 820 }}>
        {/* STEP 1: Select Policy */}
        {step === 1 && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                Step 1: Select Active Policy
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Choose the insurance policy that covers the incident.
              </p>
            </div>

            {policies.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><Shield size={32} /></div>
                <div className="empty-state-title">No Active Policies Available</div>
                <div className="empty-state-text">
                  You do not have any active insurance policies to claim against.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                {policies.map((p) => {
                  const isSelected = selectedPolicyId === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPolicyId(p.id)}
                      style={{
                        padding: 18,
                        borderRadius: 'var(--radius)',
                        border: isSelected
                          ? '2px solid var(--primary)'
                          : '1px solid var(--border-color)',
                        background: isSelected
                          ? 'rgba(59, 130, 246, 0.05)'
                          : 'var(--bg-elevated)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <input
                            type="radio"
                            checked={isSelected}
                            onChange={() => setSelectedPolicyId(p.id)}
                            style={{ accentColor: 'var(--primary)', width: 18, height: 18 }}
                          />
                          <div>
                            <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                              {p.policy_type} Policy
                            </span>
                            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              #{p.policy_number}
                            </span>
                          </div>
                        </div>
                        <span
                          style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: 'var(--success)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          ACTIVE
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                          gap: 12,
                          marginTop: 12,
                          paddingTop: 12,
                          borderTop: '1px solid var(--border-color)',
                          fontSize: 13,
                        }}
                      >
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>MAX COVERAGE</div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatCurrency(p.coverage_amount)}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>DEDUCTIBLE</div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatCurrency(p.deductible_amount)}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>VALID UNTIL</div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatDate(p.expiry_date)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleNext}
                disabled={!selectedPolicyId}
              >
                Next: Incident Details <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Incident Details */}
        {step === 2 && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                Step 2: Enter Incident Details
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Provide accurate information regarding when and where the loss or damage occurred.
              </p>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label required">Incident Category / Claim Type</label>
                <select
                  className="form-select"
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value)}
                >
                  {INCIDENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label required">Estimated Loss / Requested Amount (₹)</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 45000"
                    value={requestedAmount}
                    onChange={(e) => setRequestedAmount(e.target.value)}
                    min="100"
                    step="100"
                  />
                  {selectedPolicy && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                      Max eligible coverage: {formatCurrency(selectedPolicy.coverage_amount)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid-3">
              <div className="form-group">
                <label className="form-label required">Incident Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={incidentDate}
                  onChange={(e) => setIncidentDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Approximate Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={incidentTime}
                  onChange={(e) => setIncidentTime(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Incident Location</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. MG Road, Bengaluru"
                  value={incidentLocation}
                  onChange={(e) => setIncidentLocation(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label required">Detailed Incident Description</label>
              <textarea
                className="form-textarea"
                rows={4}
                placeholder="Describe what occurred, any third-party involvement, sequence of events, and specific damages observed..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={handleBack}>
                <ArrowLeft size={16} /> Back
              </button>
              <button type="button" className="btn btn-primary" onClick={handleNext}>
                Next: Supporting Files (Optional) <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Supporting Documents and Images (STRICTLY OPTIONAL) */}
        {step === 3 && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                  Step 3: Supporting Documents and Images
                </h2>
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: 'var(--success)',
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Strictly Optional
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                You may attach damage photos, police reports (FIR), hospital bills, or repair invoices.
                <strong> Image and document uploads are optional.</strong> You can continue and submit your claim without uploading any files.
              </p>
            </div>

            {/* Clear callout banner */}
            <div
              style={{
                display: 'flex',
                gap: 12,
                padding: 14,
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: 'var(--radius)',
              }}
            >
              <Info size={20} style={{ color: 'var(--primary-light)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--primary-light)', display: 'block', marginBottom: 2 }}>
                  No files right now? No problem!
                </strong>
                You can submit your claim immediately without any attachments. If documents are needed later, your claim officer will request them through your claim tracking portal.
              </div>
            </div>

            {/* Upload Zone 1: Incident Images (Optional) */}
            <div style={{ border: '1px dashed var(--border-color)', borderRadius: 'var(--radius)', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Image size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>
                  Upload Incident Images (Optional)
                </h3>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                Attach photos of vehicle damage, site impact, property condition, etc. (JPEG, PNG, WEBP up to 10MB)
              </p>
              <input
                type="file"
                id="images-upload"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e.target.files, 'DAMAGE_PHOTO')}
              />
              <label
                htmlFor="images-upload"
                className="btn btn-secondary"
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <Upload size={16} /> Select Incident Images
              </label>
            </div>

            {/* Upload Zone 2: Supporting Documents (Optional) */}
            <div style={{ border: '1px dashed var(--border-color)', borderRadius: 'var(--radius)', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FileText size={18} style={{ color: 'var(--warning)' }} />
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>
                  Upload Supporting Documents (Optional)
                </h3>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                Attach police FIR report, hospital discharge summary, medical bills, or repair estimates. (PDF, DOC, DOCX up to 10MB)
              </p>
              <input
                type="file"
                id="docs-upload"
                multiple
                accept=".pdf,.doc,.docx,image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e.target.files, 'REPAIR_ESTIMATE')}
              />
              <label
                htmlFor="docs-upload"
                className="btn btn-secondary"
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <Upload size={16} /> Select Documents
              </label>
            </div>

            {/* Attached Files List */}
            {uploadedFiles.length > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                  Attached Files ({uploadedFiles.length})
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                  {uploadedFiles.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: 12,
                        borderRadius: 'var(--radius)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {item.isImage && item.previewUrl && (
                        <div
                          style={{
                            height: 100,
                            borderRadius: 6,
                            overflow: 'hidden',
                            background: '#000',
                          }}
                        >
                          <img
                            src={item.previewUrl}
                            alt="Preview"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ overflow: 'hidden' }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                            }}
                            title={item.file.name}
                          >
                            {item.file.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {(item.file.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(item.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--danger)',
                            cursor: 'pointer',
                            padding: 4,
                          }}
                          title="Remove file"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <select
                        className="form-select"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        value={item.category}
                        onChange={(e) => updateFileCategory(item.id, e.target.value)}
                      >
                        <option value="DAMAGE_PHOTO">Damage Photo</option>
                        <option value="REPAIR_ESTIMATE">Repair Estimate</option>
                        <option value="FIR">Police FIR</option>
                        <option value="HOSPITAL_BILL">Hospital / Medical Bill</option>
                        <option value="MEDICAL_REPORT">Medical Report</option>
                        <option value="IDENTITY_PROOF">Identity Proof</option>
                        <option value="OTHER">Other Document</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={handleBack}>
                <ArrowLeft size={16} /> Back
              </button>
              <button type="button" className="btn btn-primary" onClick={handleNext}>
                Next: Review & Submit <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Review and Submit */}
        {step === 4 && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                Step 4: Review and Submit Claim
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Please verify all incident information before completing submission.
              </p>
            </div>

            {/* Policy Summary */}
            <div
              style={{
                padding: 16,
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  SELECTED POLICY
                </span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary-light)', fontSize: 12, cursor: 'pointer' }}
                >
                  Edit Policy
                </button>
              </div>
              {selectedPolicy && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{selectedPolicy.policy_type} Policy</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      #{selectedPolicy.policy_number}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>COVERAGE</div>
                    <strong>{formatCurrency(selectedPolicy.coverage_amount)}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Incident Summary */}
            <div
              style={{
                padding: 16,
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  INCIDENT DETAILS
                </span>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary-light)', fontSize: 12, cursor: 'pointer' }}
                >
                  Edit Details
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>INCIDENT TYPE</div>
                  <strong style={{ fontSize: 13 }}>{incidentType}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>REQUESTED AMOUNT</div>
                  <strong style={{ fontSize: 15, color: 'var(--primary-light)' }}>
                    {formatCurrency(parseFloat(requestedAmount || '0'))}
                  </strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>DATE & TIME</div>
                  <div style={{ fontSize: 13 }}>{incidentDate} at {incidentTime}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>LOCATION</div>
                  <div style={{ fontSize: 13 }}>{incidentLocation || 'Not specified'}</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>DESCRIPTION</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: 10, borderRadius: 6 }}>
                  {description}
                </div>
              </div>
            </div>

            {/* Attachments Summary */}
            <div
              style={{
                padding: 16,
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                  ATTACHED FILES (OPTIONAL)
                </span>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary-light)', fontSize: 12, cursor: 'pointer' }}
                >
                  Edit Files
                </button>
              </div>

              {uploadedFiles.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No supporting documents or images attached. (Claim submission will still proceed smoothly.)
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {uploadedFiles.map((f) => (
                    <span
                      key={f.id}
                      style={{
                        padding: '4px 10px',
                        background: 'var(--bg-card)',
                        borderRadius: 6,
                        border: '1px solid var(--border-color)',
                        fontSize: 12,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {f.isImage ? <Image size={14} /> : <FileText size={14} />}
                      {f.file.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* AI Assistant Callout */}
            <div
              style={{
                padding: 14,
                background: 'var(--primary-subtle)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-focus)',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <Sparkles size={24} style={{ color: 'var(--primary-light)', flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--primary-light)', display: 'block', marginBottom: 2 }}>
                  AI Verification & Explainable Scoring
                </strong>
                Upon submission, the platform will cross-check coverage limits, assess incident parameters, and route this claim for officer evaluation.
              </div>
            </div>

            {/* Declaration Checkbox */}
            <div
              style={{
                padding: 16,
                background: declarationAccepted ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-elevated)',
                borderRadius: 'var(--radius)',
                border: declarationAccepted ? '1px solid var(--success)' : '1px solid var(--border-color)',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={declarationAccepted}
                  onChange={(e) => setDeclarationAccepted(e.target.checked)}
                  style={{
                    accentColor: 'var(--primary)',
                    width: 18,
                    height: 18,
                    marginTop: 2,
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>
                  <strong>Declaration of Accuracy:</strong> I hereby declare that the incident details provided above are true, complete, and accurate to the best of my knowledge. I understand that misrepresentation of insurance claims constitutes insurance fraud and may lead to claim rejection.
                </span>
              </label>
            </div>

            {/* Submit Action */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBack}
                disabled={submitting}
              >
                <ArrowLeft size={16} /> Back
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmitClaim}
                disabled={!declarationAccepted || submitting}
                style={{ minWidth: 160 }}
              >
                {submitting ? (
                  <>
                    <span className="spinner spinner-sm" /> Submitting Claim...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Confirm & Submit Claim
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewClaimPage;
