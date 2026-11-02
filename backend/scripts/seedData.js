const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const { connectDB } = require('../config/db');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');
const ClaimTimeline = require('../models/ClaimTimeline');
const Settlement = require('../models/Settlement');
const Notification = require('../models/Notification');
const { AiVerificationResult } = require('../models/AiVerificationResult');

async function getOrCreateUser(fullName, email, rawPassword, phone, role, address = null) {
  let user = await User.findOne({ email });
  const passwordHash = await User.hashPassword(rawPassword);

  if (!user) {
    user = new User({
      id: uuidv4(),
      full_name: fullName,
      email,
      password_hash: passwordHash,
      phone,
      role,
      address,
      is_active: true
    });
    await user.save();
  } else {
    user.full_name = fullName;
    user.password_hash = passwordHash;
    user.phone = phone;
    user.role = role;
    user.address = address;
    user.is_active = true;
    await user.save();
  }

  // Sync customer collection
  if (role === 'CUSTOMER') {
    await Customer.findOneAndUpdate(
      { email },
      {
        $set: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          address: user.address,
          role: user.role,
          is_active: user.is_active,
          password_hash: user.password_hash
        }
      },
      { upsert: true }
    );
  }

  return user;
}

async function getOrCreatePolicy(policyNumber, customerId, policyType, coverageAmount, premiumAmount, deductibleAmount, startDate, expiryDate, status = 'ACTIVE') {
  let policy = await Policy.findOne({ policy_number: policyNumber });
  if (!policy) {
    policy = new Policy({
      id: uuidv4(),
      policy_number: policyNumber,
      customer_id: customerId,
      policy_type: policyType,
      coverage_amount: coverageAmount,
      premium_amount: premiumAmount,
      deductible_amount: deductibleAmount,
      start_date: startDate,
      expiry_date: expiryDate,
      status
    });
    await policy.save();
  }
  return policy;
}

async function getOrCreateClaim(claimNumber, policyId, customerId, incidentType, incidentDate, incidentLocation, description, requestedAmount, status, extra = {}) {
  let claim = await Claim.findOne({ claim_number: claimNumber });
  if (!claim) {
    claim = new Claim({
      id: uuidv4(),
      claim_number: claimNumber,
      policy_id: policyId,
      customer_id: customerId,
      incident_type: incidentType,
      incident_date: incidentDate,
      incident_location: incidentLocation,
      description,
      requested_amount: requestedAmount,
      status,
      ...extra
    });
    await claim.save();
  }
  return claim;
}

async function seed() {
  console.log('='.repeat(65));
  console.log('INSURECLAIM AI — MERN STACK MONGODB SEED SCRIPT');
  console.log('='.repeat(65));

  await connectDB();

  console.log('1. Seeding system users across roles (ADMIN, OFFICER, CUSTOMER)...');

  const admin = await getOrCreateUser(
    'System Admin',
    'admin@insureclaim.com',
    'Admin@1234',
    '+91-9800000001',
    'ADMIN',
    'HQ Security Operations, Mumbai'
  );

  const officer1 = await getOrCreateUser(
    'Rajesh Kumar',
    'officer1@insureclaim.com',
    'Officer@1234',
    '+91-9800000010',
    'CLAIM_OFFICER',
    'Adjudication Branch, Pune'
  );

  const officer2 = await getOrCreateUser(
    'Priya Sharma',
    'officer2@insureclaim.com',
    'Officer@1234',
    '+91-9800000011',
    'CLAIM_OFFICER',
    'Fraud Investigation Unit, Bangalore'
  );

  const customer1 = await getOrCreateUser(
    'Amit Verma',
    'amit@example.com',
    'Customer@1234',
    '+91-9900000001',
    'CUSTOMER',
    '102 Silver Oak, Koregaon Park, Pune'
  );

  const customer2 = await getOrCreateUser(
    'Sunita Patel',
    'sunita@example.com',
    'Customer@1234',
    '+91-9900000002',
    'CUSTOMER',
    '45 Green Acres, Indiranagar, Bangalore'
  );

  const customer3 = await getOrCreateUser(
    'Ravi Mehta',
    'ravi@example.com',
    'Customer@1234',
    '+91-9900000003',
    'CUSTOMER',
    'B-12 Hill View, Andheri West, Mumbai'
  );

  console.log('   Users ready.');

  console.log('2. Seeding insurance policies...');
  const today = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  const policy1 = await getOrCreatePolicy(
    'POL-2025-MOT-001',
    customer1.id,
    'Motor Vehicle',
    500000,
    12000,
    5000,
    new Date(today.getTime() - 180 * dayMs),
    new Date(today.getTime() + 185 * dayMs),
    'ACTIVE'
  );

  const policy2 = await getOrCreatePolicy(
    'POL-2025-HLT-002',
    customer1.id,
    'Health',
    300000,
    8000,
    2000,
    new Date(today.getTime() - 90 * dayMs),
    new Date(today.getTime() + 275 * dayMs),
    'ACTIVE'
  );

  const policy3 = await getOrCreatePolicy(
    'POL-2025-MOT-003',
    customer2.id,
    'Motor Vehicle',
    800000,
    18000,
    8000,
    new Date(today.getTime() - 60 * dayMs),
    new Date(today.getTime() + 305 * dayMs),
    'ACTIVE'
  );

  const policy4 = await getOrCreatePolicy(
    'POL-2025-HLT-004',
    customer3.id,
    'Health',
    500000,
    15000,
    3000,
    new Date(today.getTime() - 30 * dayMs),
    new Date(today.getTime() + 335 * dayMs),
    'ACTIVE'
  );

  const policy5 = await getOrCreatePolicy(
    'POL-2024-MOT-005',
    customer2.id,
    'Property',
    2000000,
    25000,
    10000,
    new Date(today.getTime() - 400 * dayMs),
    new Date(today.getTime() - 30 * dayMs),
    'EXPIRED'
  );
  console.log('   Policies ready.');

  console.log('3. Seeding insurance claims covering workflow states...');

  const claim1 = await getOrCreateClaim(
    'CLM20260001',
    policy1.id,
    customer1.id,
    'Motor Vehicle Accident',
    new Date(today.getTime() - 15 * dayMs),
    'NH-48 Junction, Pune',
    'Frontal collision with commercial truck while turning. Damaged bumper, bonnet, and radiator.',
    85000,
    'SETTLED',
    {
      approved_amount: 72000,
      fraud_score: 0.12,
      risk_level: 'LOW',
      assigned_officer_id: officer1.id
    }
  );

  const claim2 = await getOrCreateClaim(
    'CLM20260002',
    policy3.id,
    customer2.id,
    'Motor Vehicle Accident',
    new Date(today.getTime() - 5 * dayMs),
    'MG Road Signal, Bangalore',
    'Rear-ended at traffic signal during heavy rain. Broken tail lamps and trunk dent.',
    45000,
    'UNDER_OFFICER_REVIEW',
    {
      fraud_score: 0.22,
      risk_level: 'LOW',
      assigned_officer_id: officer1.id
    }
  );

  const claim3 = await getOrCreateClaim(
    'CLM20260003',
    policy2.id,
    customer1.id,
    'Medical Emergency',
    new Date(today.getTime() - 2 * dayMs),
    'Apollo Hospital, Mumbai',
    'Emergency appendectomy procedure and subsequent 3-day post-operative ICU care.',
    285000,
    'UNDER_FRAUD_REVIEW',
    {
      fraud_score: 0.78,
      risk_level: 'HIGH',
      assigned_officer_id: officer2.id
    }
  );

  const claim4 = await getOrCreateClaim(
    'CLM20260004',
    policy4.id,
    customer3.id,
    'Medical Emergency',
    new Date(today.getTime() - 8 * dayMs),
    'City Care Hospital, Delhi',
    'Inpatient treatment for acute dengue with severe platelet count drop.',
    120000,
    'APPROVAL_PENDING',
    {
      approved_amount: 110000,
      fraud_score: 0.18,
      risk_level: 'LOW',
      assigned_officer_id: officer2.id
    }
  );

  const claim5 = await getOrCreateClaim(
    'CLM20260005',
    policy1.id,
    customer1.id,
    'Motor Vehicle Accident',
    new Date(today.getTime() - 1 * dayMs),
    'Dadar Mall Parking, Mumbai',
    'Left wing mirror snapped and passenger door scratched in underground parking.',
    8000,
    'DRAFT'
  );

  const claim6 = await getOrCreateClaim(
    'CLM20260006',
    policy3.id,
    customer2.id,
    'Theft',
    new Date(today.getTime() - 20 * dayMs),
    'Andheri Metro Station, Mumbai',
    'Vehicle stolen from designated parking overnight. Key handover pending.',
    800000,
    'REJECTED',
    {
      fraud_score: 0.91,
      risk_level: 'VERY_HIGH',
      rejection_reason: 'Claim amount exceeds policy coverage. FIR jurisdiction does not match registered vehicle domicile.',
      assigned_officer_id: officer1.id
    }
  );

  console.log('   Claims ready.');

  console.log('4. Seeding settlement and timelines...');
  const existingSettlement = await Settlement.findOne({ claim_id: claim1.id });
  if (!existingSettlement) {
    await Settlement.create({
      id: uuidv4(),
      claim_id: claim1.id,
      approved_amount: 72000,
      payment_amount: 67000,
      payment_reference: 'NEFT/20261024/0001',
      payment_method: 'NEFT',
      payment_status: 'COMPLETED',
      processed_by: admin.id,
      completed_at: new Date(today.getTime() - 3 * dayMs),
      created_at: new Date(today.getTime() - 4 * dayMs)
    });
  }

  const existingTimelines = await ClaimTimeline.find({ claim_id: claim1.id });
  if (existingTimelines.length === 0) {
    await ClaimTimeline.insertMany([
      { id: uuidv4(), claim_id: claim1.id, status: 'DRAFT', description: 'Draft initiated by customer', created_by: customer1.id, created_at: new Date(today.getTime() - 15 * dayMs) },
      { id: uuidv4(), claim_id: claim1.id, status: 'SUBMITTED', description: 'Claim submitted with initial incident photos', created_by: customer1.id, created_at: new Date(today.getTime() - 14 * dayMs) },
      { id: uuidv4(), claim_id: claim1.id, status: 'UNDER_OFFICER_REVIEW', description: 'Assigned to Rajesh Kumar for document scrutiny', created_by: admin.id, created_at: new Date(today.getTime() - 12 * dayMs) },
      { id: uuidv4(), claim_id: claim1.id, status: 'APPROVED', description: 'Officer and Admin approved for ₹72,000', created_by: admin.id, created_at: new Date(today.getTime() - 7 * dayMs) },
      { id: uuidv4(), claim_id: claim1.id, status: 'SETTLED', description: 'Settlement payment of ₹67,000 processed via NEFT (after ₹5,000 deductible)', created_by: admin.id, created_at: new Date(today.getTime() - 3 * dayMs) }
    ]);
  }

  // Seed notifications
  const existingNotifs = await Notification.find({ user_id: customer1.id });
  if (existingNotifs.length === 0) {
    await Notification.insertMany([
      { id: uuidv4(), user_id: customer1.id, type: 'SETTLEMENT_COMPLETED', title: 'Claim Settled', message: 'Settlement payment of ₹67,000 has been credited via NEFT.', claim_id: claim1.id, is_read: false, created_at: new Date() },
      { id: uuidv4(), user_id: customer2.id, type: 'CLAIM_SUBMITTED', title: 'Claim Under Review', message: 'Your claim CLM20260002 is assigned to Rajesh Kumar.', claim_id: claim2.id, is_read: false, created_at: new Date() }
    ]);
  }

  // Update total_claims on Customers
  for (const c of [customer1, customer2, customer3]) {
    const count = await Claim.countDocuments({ customer_id: c.id });
    await Customer.updateOne({ id: c.id }, { $set: { total_claims: count } });
  }

  console.log('\n' + '='.repeat(65));
  console.log('DEMO CREDENTIALS FOR PROJECT REVIEW');
  console.log('='.repeat(65));
  console.log('ADMIN:          admin@insureclaim.com        / Admin@1234');
  console.log('CLAIM OFFICER:  officer1@insureclaim.com     / Officer@1234');
  console.log('CLAIM OFFICER:  officer2@insureclaim.com     / Officer@1234');
  console.log('CUSTOMER 1:     amit@example.com             / Customer@1234');
  console.log('CUSTOMER 2:     sunita@example.com           / Customer@1234');
  console.log('CUSTOMER 3:     ravi@example.com             / Customer@1234');
  console.log('='.repeat(65) + '\n');

  await mongoose.disconnect();
  console.log('Database seeded successfully.');
}

if (require.main === module) {
  seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}

module.exports = seed;

