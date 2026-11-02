const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const claimTimelineSchema = new mongoose.Schema(
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
    status: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    created_by: {
      type: String,
      ref: 'User',
      default: null
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true
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

claimTimelineSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

module.exports = mongoose.model('ClaimTimeline', claimTimelineSchema, 'claim_timeline');

