const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const customerSchema = new mongoose.Schema(
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
    full_name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    phone: {
      type: String,
      trim: true,
      default: null
    },
    address: {
      type: String,
      trim: true,
      default: null
    },
    role: {
      type: String,
      default: 'CUSTOMER'
    },
    is_active: {
      type: Boolean,
      default: true
    },
    password_hash: {
      type: String,
      default: null
    },
    total_claims: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id || ret.id;
        delete ret.password_hash;
        delete ret.__v;
        return ret;
      }
    }
  }
);

customerSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

module.exports = mongoose.model('Customer', customerSchema, 'customers');

