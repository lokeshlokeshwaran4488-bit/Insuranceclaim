const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const documentRequestSchema = new mongoose.Schema(
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
    requested_by: {
      type: String,
      ref: 'User',
      required: true
    },
    document_types: {
      type: [String],
      required: true,
      default: []
    },
    message: {
      type: String,
      required: true
    },
    deadline_days: {
      type: Number,
      default: 7
    },
    is_fulfilled: {
      type: Boolean,
      default: false,
      index: true
    },
    fulfilled_at: {
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

documentRequestSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

module.exports = mongoose.model('DocumentRequest', documentRequestSchema, 'document_requests');

