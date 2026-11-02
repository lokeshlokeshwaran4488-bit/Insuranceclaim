const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const aiVerificationResultSchema = new mongoose.Schema(
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
    analysis_type: {
      type: String,
      default: 'AI_UNIFIED_VERIFICATION'
    },
    overall_verification_status: {
      type: String,
      enum: ['VERIFIED', 'SUSPICIOUS', 'UNCERTAIN', 'MANUAL_REVIEW', 'PENDING'],
      default: 'PENDING',
      index: true
    },
    image_verification_score: {
      type: Number,
      default: null
    },
    image_verification_status: {
      type: String,
      default: 'PENDING'
    },
    image_explanation: {
      type: String,
      default: ''
    },
    image_details: {
      type: Array,
      default: []
    },
    document_verification_score: {
      type: Number,
      default: null
    },
    document_verification_status: {
      type: String,
      default: 'PENDING'
    },
    document_explanation: {
      type: String,
      default: ''
    },
    document_details: {
      type: Array,
      default: []
    },
    fraud_risk_score: {
      type: Number,
      default: 0.05
    },
    risk_level: {
      type: String,
      default: 'LOW'
    },
    risk_indicators: {
      type: Array,
      default: []
    },
    overall_explanation: {
      type: String,
      default: ''
    },
    detected_concerns: {
      type: [String],
      default: []
    },
    missing_documents: {
      type: [String],
      default: []
    },
    duplicate_findings: {
      type: Array,
      default: []
    },
    total_documents_analyzed: {
      type: Number,
      default: 0
    },
    total_images_analyzed: {
      type: Number,
      default: 0
    },
    requested_by: {
      type: String,
      default: null
    },
    model_version: {
      type: String,
      default: 'InsureClaim-VisionDoc-v2.1'
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

aiVerificationResultSchema.pre('save', function (next) {
  if (!this.id) {
    this.id = this._id;
  }
  next();
});

const AiVerificationResult = mongoose.model('AiVerificationResult', aiVerificationResultSchema, 'ai_verification_results');

// Also create historical ai_analysis schema
const aiAnalysisSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => uuidv4()
    },
    claim_id: {
      type: String,
      required: true,
      index: true
    },
    analysis_type: {
      type: String,
      required: true,
      index: true
    },
    document_id: {
      type: String,
      default: null
    },
    model_version: {
      type: String,
      default: 'v1.0'
    },
    input_data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    output_data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    requested_by: {
      type: String,
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

const AiAnalysis = mongoose.model('AiAnalysis', aiAnalysisSchema, 'ai_analysis');

module.exports = {
  AiVerificationResult,
  AiAnalysis
};

