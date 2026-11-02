const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const notificationSchema = new mongoose.Schema(
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
    user_id: {
      type: String,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    claim_id: {
      type: String,
      ref: 'Claim',
      default: null
    },
    is_read: {
      type: Boolean,
      default: false,
      index: true
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

notificationSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

module.exports = mongoose.model('Notification', notificationSchema, 'notifications');

