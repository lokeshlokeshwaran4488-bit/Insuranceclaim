const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const claimSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => uuidv4()
    },
    id: {
      type: String,
      default: function() { return this._id; },
      index: true
    },
    claim_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    policy_id: {
      type: String,
      ref: 'Policy',
      required: true,
      index: true
    },
    customer_id: {
      type: String,
      ref: 'User',
      required: true,
      index: true
    },
    incident_type: {
      type: String,
      required: true,
      trim: true
    },
    incident_date: {
      type: Date,
      default: null
    },
    incident_time: {
      type: String,
      default: null
    },
    incident_location: {
      type: String,
      default: null
    },
    description: {
      type: String,
      default: null
    },
    requested_amount: {
      type: Number,
      required: true,
      default: 0
    },
    approved_amount: {
      type: Number,
      default: null
    },
    status: {
      type: String,
      default: 'DRAFT',
      index: true
    },
    fraud_score: {
      type: Number,
      default: null
    },
    risk_level: {
      type: String,
      enum: ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', null],
      default: null
    },
    assigned_officer_id: {
      type: String,
      ref: 'User',
      default: null,
      index: true
    },
    rejection_reason: {
      type: String,
      default: null
    },
    approval_notes: {
      type: String,
      default: null
    },
    escalation_reason: {
      type: String,
      default: null
    },
    escalated_by: {
      type: String,
      ref: 'User',
      default: null
    },
    escalated_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id || ret.id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

claimSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

module.exports = mongoose.model('Claim', claimSchema, 'claims');

