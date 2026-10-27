// TypeScript interfaces for the insurance claim system
// ── Auth ────────────────────────────────────────────
export interface User {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  address?: string;
  role: UserRole;
  is_active: boolean;
  profile_picture_url?: string;
  created_at: string;
}

export type UserRole = 'CUSTOMER' | 'CLAIM_OFFICER' | 'ADMIN';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  role?: UserRole;
}

export interface CreateCustomerRequest {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
}

export interface CustomerListResponse {
  customers: User[];
  total: number;
  page: number;
  page_size: number;
}

// ── Policy ──────────────────────────────────────────
export interface Policy {
  id: string;
  policy_number: string;
  customer_id: string;
  policy_type: string;
  coverage_amount: number;
  premium_amount: number;
  deductible_amount: number;
  start_date: string;
  expiry_date: string;
  status: PolicyStatus;
  policy_details?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type PolicyStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

// ── Claim ───────────────────────────────────────────
export interface Claim {
  id: string;
  claim_number: string;
  policy_id: string;
  customer_id: string;
  incident_type: string;
  incident_date?: string;
  incident_time?: string;
  incident_location?: string;
  description?: string;
  requested_amount: number;
  approved_amount?: number;
  status: ClaimStatus;
  fraud_score?: number;
  risk_level?: RiskLevel;
  assigned_officer_id?: string;
  rejection_reason?: string;
  approval_notes?: string;
  created_at: string;
  updated_at: string;
  // Enriched fields
  customer_name?: string;
  policy_number?: string;
  officer_name?: string;
  settlement_id?: string;
  settlement_amount?: number;
  payment_status?: string;
  payment_method?: string;
  payment_reference?: string;
  // AI Verification Scores & Escalation
  image_verification_score?: number | null;
  document_verification_score?: number | null;
  overall_verification_status?: 'VERIFIED' | 'SUSPICIOUS' | 'UNCERTAIN' | 'MANUAL_REVIEW' | 'PENDING';
  escalation_reason?: string;
  escalated_by_name?: string;
  escalated_at?: string;
}

export type ClaimStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'DOCUMENTS_PENDING'
  | 'DOCUMENTS_RECEIVED'
  | 'UNDER_VERIFICATION'
  | 'AI_ANALYSIS_COMPLETED'
  | 'UNDER_OFFICER_REVIEW'
  | 'ADDITIONAL_DOCUMENTS_REQUIRED'
  | 'UNDER_FRAUD_REVIEW'
  | 'ADMIN_REVIEW_REQUIRED'
  | 'NEEDS_ADMIN_CLARIFICATION'
  | 'APPROVAL_PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SETTLEMENT_PENDING'
  | 'SETTLEMENT_PROCESSING'
  | 'SETTLED'
  | 'CLOSED';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';

export interface ClaimTimeline {
  id: string;
  status: string;
  description: string;
  created_by?: string;
  created_at: string;
}

export interface CreateClaimRequest {
  policy_id: string;
  incident_type: string;
  incident_date?: string;
  incident_time?: string;
  incident_location?: string;
  description?: string;
  requested_amount: number;
}

export interface ApproveClaimRequest {
  approved_amount: number;
  approval_notes?: string;
}

export interface RejectClaimRequest {
  rejection_reason: string;
}

// ── Document ────────────────────────────────────────
export interface ClaimDocument {
  id: string;
  claim_id: string;
  customer_id: string;
  filename: string;
  original_filename: string;
  document_category: DocumentCategory;
  file_path: string;
  file_size: number;
  mime_type: string;
  content_hash?: string;
  status: DocumentStatus;
  upload_timestamp: string;
  verified_by?: string;
  verified_at?: string;
  rejection_reason?: string;
}

export type DocumentCategory =
  | 'IDENTITY_PROOF'
  | 'POLICY_DOCUMENT'
  | 'FIR'
  | 'HOSPITAL_BILL'
  | 'MEDICAL_REPORT'
  | 'VEHICLE_REGISTRATION'
  | 'DRIVING_LICENCE'
  | 'DAMAGE_PHOTO'
  | 'REPAIR_ESTIMATE'
  | 'OTHER';

export type DocumentStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'VERIFIED'
  | 'MISMATCH'
  | 'REJECTED'
  | 'MANUAL_REVIEW_REQUIRED';

// ── Settlement ──────────────────────────────────────
export interface Settlement {
  id: string;
  claim_id: string;
  approved_amount: number;
  payment_amount: number;
  payment_reference?: string;
  payment_method?: string;
  payment_status: PaymentStatus;
  failure_reason?: string;
  processed_by?: string;
  processed_at?: string;
  completed_at?: string;
  created_at: string;
  // Enriched
  claim_number?: string;
  customer_name?: string;
}

export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// ── Notification ────────────────────────────────────
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  claim_id?: string;
  is_read: boolean;
  created_at: string;
}

// ── Analytics ───────────────────────────────────────
export interface DashboardStats {
  total_customers: number;
  active_policies: number;
  claims_today: number;
  total_claims: number;
  pending_claims: number;
  approved_claims: number;
  rejected_claims: number;
  fraud_alerts: number;
  settlement_pending: number;
  total_paid_amount: number;
}

export interface ClaimsAnalytics {
  claims_by_month: Array<{ month: string; count: number }>;
  claims_by_type: Array<{ type: string; count: number }>;
  claims_by_status: Array<{ status: string; count: number }>;
  approval_rate: number;
  rejection_rate: number;
  avg_processing_days: number;
}

// ── AI ──────────────────────────────────────────────
export interface AIAnalysis {
  status: string;
  data?: {
    incident_summary?: string;
    damage_type?: string;
    severity_assessment?: string;
    missing_information?: string[];
    recommended_documents?: string[];
    red_flags?: string[];
    claim_validity_assessment?: string;
    officer_notes?: string;
  };
}

export interface FraudScore {
  fraud_probability: number;
  risk_level: RiskLevel;
  recommendation: string;
  factors: string[];
  model_version: string;
}

// ── Pagination ──────────────────────────────────────
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// ── API Error ───────────────────────────────────────
export interface APIError {
  detail: string | { msg: string; type: string }[];
}

// ── Document Requests & Reviews ──────────────────────
export interface DocumentRequest {
  id: string;
  claim_id: string;
  requested_by: string;
  document_types: string[];
  message: string;
  deadline_days?: number;
  is_fulfilled: boolean;
  fulfilled_at?: string;
  created_at: string;
}

export interface ClaimReview {
  id: string;
  claim_id: string;
  officer_id: string;
  review_type: string;
  remarks: string;
  is_internal: boolean;
  created_at: string;
}

// ── WebSocket ───────────────────────────────────────
export interface WebSocketMessage {
  type: string;
  claim_id?: string;
  status?: string;
  message?: string;
  timestamp?: string;
}

// ── AI Unified Verification ─────────────────────────
export interface AiVerificationResult {
  claim_id: string;
  analysis_type: string;
  overall_verification_status: 'VERIFIED' | 'SUSPICIOUS' | 'UNCERTAIN' | 'MANUAL_REVIEW' | 'PENDING';
  image_verification_score: number | null;
  image_verification_status: string;
  image_explanation: string;
  image_details?: Array<{
    id: string;
    filename: string;
    category: string;
    status: string;
    resolution: string;
    blur_score: number;
    is_blurry: boolean;
    damage_type: string;
    damage_detected: boolean | null;
    relevant_to_incident: boolean;
    concerns: string[];
    manipulation_signs: string[];
    has_duplicate: boolean;
  }>;
  document_verification_score: number | null;
  document_verification_status: string;
  document_explanation: string;
  document_details?: Array<{
    id: string;
    filename: string;
    category: string;
    status: string;
    ocr_method: string;
    ocr_success: boolean;
    extracted_length: number;
    matches: string[];
    discrepancies: string[];
    missing_fields: string[];
    has_duplicate: boolean;
  }>;
  fraud_risk_score: number;
  risk_level: string;
  risk_indicators: string[];
  overall_explanation: string;
  detected_concerns: string[];
  missing_documents: string[];
  duplicate_findings: any[];
  total_documents_analyzed: number;
  total_images_analyzed: number;
  created_at: string;
  model_version: string;
}

