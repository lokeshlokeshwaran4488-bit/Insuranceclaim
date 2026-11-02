const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
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
    password_hash: {
      type: String,
      required: true
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
      enum: ['CUSTOMER', 'CLAIM_OFFICER', 'ADMIN'],
      default: 'CUSTOMER',
      index: true
    },
    is_active: {
      type: Boolean,
      default: true
    },
    profile_picture_url: {
      type: String,
      default: null
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

userSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

userSchema.methods.verifyPassword = async function (password) {
  return bcrypt.compare(password, this.password_hash);
};

userSchema.statics.hashPassword = async function (password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

module.exports = mongoose.model('User', userSchema, 'users');

