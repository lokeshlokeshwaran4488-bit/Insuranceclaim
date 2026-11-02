const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const adminClarificationSchema = new mongoose.Schema(
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
    admin_id: {
      type: String,
      ref: 'User',
      default: null
    },
    question: {
      type: String,
      required: true
    },
    answer: {
      type: String,
      default: null
    },
    status: {
      type: String,
      enum: ['PENDING', 'ANSWERED'],
      default: 'PENDING',
      index: true
    },
    requested_at: {
      type: Date,
      default: Date.now
    },
    answered_at: {
      type: Date,
      default: null
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

adminClarificationSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

module.exports = mongoose.model('AdminClarification', adminClarificationSchema, 'admin_clarifications');

