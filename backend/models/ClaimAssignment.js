const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const claimAssignmentSchema = new mongoose.Schema(
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
      required: true,
      index: true
    },
    assigned_by: {
      type: String,
      ref: 'User',
      required: true
    },
    assigned_at: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      default: 'ASSIGNED'
    },
    notes: {
      type: String,
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

claimAssignmentSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

module.exports = mongoose.model('ClaimAssignment', claimAssignmentSchema, 'claim_assignments');

