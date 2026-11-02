const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const officerReviewSchema = new mongoose.Schema(
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
      index: true
    },
    officer_id: {
      type: String,
      ref: 'User',
      required: true
    },
    review_type: {
      type: String,
      required: true,
      enum: ['DOCUMENT_REQUEST', 'RECOMMENDATION', 'ESCALATION', 'NOTE', 'CLARIFICATION'],
      default: 'NOTE'
    },
    remarks: {
      type: String,
      required: true
    },
    recommendation: {
      type: String,
      enum: ['APPROVE', 'REJECT', 'ESCALATE', null],
      default: null
    },
    is_internal: {
      type: Boolean,
      default: false
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

officerReviewSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

module.exports = mongoose.model('OfficerReview', officerReviewSchema, 'claim_reviews');

