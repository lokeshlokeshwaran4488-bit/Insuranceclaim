const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const settlementSchema = new mongoose.Schema(
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
    claim_id: {
      type: String,
      ref: 'Claim',
      required: true,
      unique: true,
      index: true
    },
    approved_amount: {
      type: Number,
      required: true
    },
    payment_amount: {
      type: Number,
      required: true
    },
    payment_reference: {
      type: String,
      default: null
    },
    payment_method: {
      type: String,
      enum: ['BANK_TRANSFER', 'CHEQUE', 'NEFT', 'RTGS', null],
      default: 'NEFT'
    },
    payment_status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
      index: true
    },
    bank_account_encrypted: {
      type: String,
      default: null
    },
    failure_reason: {
      type: String,
      default: null
    },
    processed_by: {
      type: String,
      ref: 'User',
      default: null
    },
    processed_at: {
      type: Date,
      default: null
    },
    completed_at: {
      type: Date,
      default: null
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id || ret.id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

settlementSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

module.exports = mongoose.model('Settlement', settlementSchema, 'settlements');

