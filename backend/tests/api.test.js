const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { app, startServer } = require('../server');
const config = require('../config/config');
const { connectDB } = require('../config/db');

let server;
let baseUrl;

test.before(async () => {
  await connectDB();
  await new Promise((resolve) => {
    // Start test server on random port or 5001
    const testPort = 5001;
    server = app.listen(testPort, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${testPort}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  const mongoose = require('mongoose');
  await mongoose.disconnect();
  // Exit cleanly
  process.exit(0);
});

async function apiRequest(endpoint, { method = 'GET', body = null, token = null, headers = {} } = {}) {
  const reqHeaders = { ...headers };
  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }
  if (body && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: reqHeaders,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null
  });

  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { status: response.status, data, headers: response.headers };
}

test('1. System Health Check', async () => {
  const res = await apiRequest('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'healthy');
  assert.equal(res.data.services.mongodb.status, 'connected');
  assert.equal(res.data.services.postgres, undefined, 'PostgreSQL must not be in health report');
});

test('2. Authentication - Admin, Officer, and Customer Login', async (t) => {
  let adminToken, officerToken, customerToken;

  await t.test('Admin Login', async () => {
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@insureclaim.com', password: 'Admin@1234' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.access_token);
    assert.ok(res.data.refresh_token);
    adminToken = res.data.access_token;

    // Test /api/auth/me
    const meRes = await apiRequest('/api/auth/me', { token: adminToken });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.role, 'ADMIN');
  });

  await t.test('Officer Login', async () => {
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'officer1@insureclaim.com', password: 'Officer@1234' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.access_token);
    officerToken = res.data.access_token;

    const meRes = await apiRequest('/api/auth/me', { token: officerToken });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.role, 'CLAIM_OFFICER');
  });

  await t.test('Customer Login', async () => {
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'amit@example.com', password: 'Customer@1234' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.access_token);
    customerToken = res.data.access_token;

    const meRes = await apiRequest('/api/auth/me', { token: customerToken });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.role, 'CUSTOMER');
  });
});

test('3. Customer Workflow - Policies, Submit Claim, Upload Document', async () => {
  // Login as Customer
  const loginRes = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: 'amit@example.com', password: 'Customer@1234' }
  });
  const token = loginRes.data.access_token;

  // 1. Get my policies
  const polRes = await apiRequest('/api/policies/my-policies', { token });
  assert.equal(polRes.status, 200);
  assert.ok(Array.isArray(polRes.data));
  assert.ok(polRes.data.length > 0);
  const policyId = polRes.data[0].id;

  // 2. Create new claim draft
  const createRes = await apiRequest('/api/claims', {
    method: 'POST',
    token,
    body: {
      policy_id: policyId,
      incident_type: 'Motor Vehicle Accident',
      incident_date: new Date().toISOString().split('T')[0],
      incident_location: 'FC Road, Pune',
      description: 'Minor fender bender during evening rush hour traffic with superficial bumper dent.',
      requested_amount: 15000
    }
  });
  assert.equal(createRes.status, 201);
  assert.equal(createRes.data.status, 'DRAFT');
  const claimId = createRes.data.id;

  // 3. Submit claim
  const submitRes = await apiRequest(`/api/claims/${claimId}/submit`, {
    method: 'POST',
    token
  });
  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.data.status, 'SUBMITTED');

  // 4. View claim timeline
  const timelineRes = await apiRequest(`/api/claims/${claimId}/timeline`, { token });
  assert.equal(timelineRes.status, 200);
  assert.ok(Array.isArray(timelineRes.data));
  assert.ok(timelineRes.data.some(t => t.status === 'SUBMITTED'));
});

test('4. Claim Officer Workflow - Review, AI Verification, Request Docs, Recommend Approval', async () => {
  // Login as Officer
  const officerLogin = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: 'officer1@insureclaim.com', password: 'Officer@1234' }
  });
  const token = officerLogin.data.access_token;

  // 1. View claims
  const claimsRes = await apiRequest('/api/claims', { token });
  assert.equal(claimsRes.status, 200);
  assert.ok(claimsRes.data.claims.length > 0);
  const testClaim = claimsRes.data.claims[0];

  // 2. Run AI Verification
  const aiRes = await apiRequest(`/api/claims/${testClaim.id}/verify-ai`, {
    method: 'POST',
    token
  });
  assert.equal(aiRes.status, 200);
  assert.ok(aiRes.data.overall_verification_status);
  assert.ok(typeof aiRes.data.fraud_risk_score === 'number');

  // 3. Fetch latest AI verification
  const getAiRes = await apiRequest(`/api/claims/${testClaim.id}/ai-verification`, { token });
  assert.equal(getAiRes.status, 200);
  assert.equal(getAiRes.data.claim_id, testClaim.id);

  // 4. Start review
  const reviewRes = await apiRequest(`/api/claims/${testClaim.id}/start-review`, {
    method: 'POST',
    token
  });
  assert.equal(reviewRes.status, 200);
  assert.equal(reviewRes.data.status, 'UNDER_OFFICER_REVIEW');

  // 5. Add note
  const noteRes = await apiRequest(`/api/claims/${testClaim.id}/notes`, {
    method: 'POST',
    token,
    body: { remarks: 'Scrutinized invoices and verified repair estimates.', is_internal: true }
  });
  assert.equal(noteRes.status, 200);

  // 6. Request Clarification from Admin
  const clarRes = await apiRequest(`/api/claims/${testClaim.id}/request-clarification`, {
    method: 'POST',
    token,
    body: { question: 'Does third-party bumper replacement require original manufacturer invoice?' }
  });
  assert.equal(clarRes.status, 200);
  assert.equal(clarRes.data.status, 'NEEDS_ADMIN_CLARIFICATION');
});

test('5. Admin Workflow - Clarification Response, Approval, Settlement, Reports & Analytics', async () => {
  // Login as Admin
  const adminLogin = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@insureclaim.com', password: 'Admin@1234' }
  });
  const token = adminLogin.data.access_token;

  // 1. View all claims
  const claimsRes = await apiRequest('/api/claims', { token });
  assert.equal(claimsRes.status, 200);
  const clarificationClaim = claimsRes.data.claims.find(c => c.status === 'NEEDS_ADMIN_CLARIFICATION') || claimsRes.data.claims[0];

  // 2. Respond to clarification
  const respRes = await apiRequest(`/api/claims/${clarificationClaim.id}/respond-clarification`, {
    method: 'POST',
    token,
    body: { answer: 'Original GST invoice is required per Section 4.b of policy schedule.' }
  });
  assert.equal(respRes.status, 200);
  assert.equal(respRes.data.status, 'UNDER_OFFICER_REVIEW');

  // 3. Approve claim
  const approveRes = await apiRequest(`/api/claims/${clarificationClaim.id}/approve`, {
    method: 'POST',
    token,
    body: { approved_amount: 12000, approval_notes: 'Approved after verification' }
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.data.status, 'APPROVED');

  // 4. Create Settlement
  const settleRes = await apiRequest('/api/settlements', {
    method: 'POST',
    token,
    body: {
      claim_id: clarificationClaim.id,
      payment_amount: 11000,
      payment_method: 'NEFT',
      bank_account: 'HDFC0001234:9876543210'
    }
  });
  assert.equal(settleRes.status, 201);
  assert.equal(settleRes.data.payment_status, 'PENDING');
  const settlementId = settleRes.data.id;

  // 5. Complete settlement
  const compRes = await apiRequest(`/api/settlements/${settlementId}/complete`, {
    method: 'POST',
    token
  });
  assert.equal(compRes.status, 200);
  assert.equal(compRes.data.payment_status, 'COMPLETED');

  // 6. Analytics Dashboard
  const dashRes = await apiRequest('/api/admin/analytics/dashboard', { token });
  assert.equal(dashRes.status, 200);
  assert.ok(typeof dashRes.data.total_claims === 'number');
  assert.ok(typeof dashRes.data.total_customers === 'number');

  // 7. Reports Summary
  const repRes = await apiRequest('/api/reports/summary', { token });
  assert.equal(repRes.status, 200);
  assert.ok(repRes.data.total_claims >= 0);

  // 8. Export CSV
  const csvRes = await apiRequest('/api/reports/claims/export-csv', { token });
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.data.includes('Claim Number'));
});
