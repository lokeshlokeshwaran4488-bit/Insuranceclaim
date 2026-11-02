const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const claimDocumentSchema = new mongoose.Schema(
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
    customer_id: {
      type: String,
      ref: 'User',
      required: true,
      index: true
    },
    filename: {
      type: String,
      required: true
    },
    original_filename: {
      type: String,
      required: true
    },
    document_category: {
      type: String,
      required: true,
      index: true
    },
    file_path: {
      type: String,
      required: true
    },
    file_size: {
      type: Number,
      required: true
    },
    mime_type: {
      type: String,
      default: 'application/octet-stream'
    },
    content_hash: {
      type: String,
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: ['UPLOADED', 'PROCESSING', 'VERIFIED', 'MISMATCH', 'REJECTED', 'MANUAL_REVIEW_REQUIRED'],
      default: 'UPLOADED'
    },
    upload_timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    verified_by: {
      type: String,
      ref: 'User',
      default: null
    },
    verified_at: {
      type: Date,
      default: null
    },
    rejection_reason: {
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

claimDocumentSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

module.exports = mongoose.model('ClaimDocument', claimDocumentSchema, 'claim_documents');

