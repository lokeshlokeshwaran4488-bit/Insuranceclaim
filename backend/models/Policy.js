const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const policySchema = new mongoose.Schema(
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
    policy_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    customer_id: {
      type: String,
      ref: 'User',
      required: true,
      index: true
    },
    policy_type: {
      type: String,
      required: true,
      trim: true
    },
    coverage_amount: {
      type: Number,
      required: true,
      min: 0
    },
    premium_amount: {
      type: Number,
      required: true,
      min: 0
    },
    deductible_amount: {
      type: Number,
      default: 0,
      min: 0
    },
    start_date: {
      type: Date,
      required: true
    },
    expiry_date: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
      default: 'ACTIVE',
      index: true
    },
    policy_details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
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

policySchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

module.exports = mongoose.model('Policy', policySchema, 'policies');

