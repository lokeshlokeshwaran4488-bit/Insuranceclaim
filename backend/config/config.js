const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const config = {
  appName: process.env.APP_NAME || 'InsureClaim AI',
  version: '2.0.0',
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/insurance_claims',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_insureclaim_jwt_development_key_32_chars_min',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  jwtExpiresInSeconds: 86400,
  uploadDir: process.env.UPLOAD_DIR ? path.resolve(__dirname, '..', process.env.UPLOAD_DIR) : path.resolve(__dirname, '../uploads'),
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10,
  allowedExtensions: (process.env.ALLOWED_EXTENSIONS || 'pdf,jpg,jpeg,png').split(',').map(ext => ext.trim().toLowerCase()),
  aesKey: process.env.AES_ENCRYPTION_KEY || '12345678901234567890123456789012',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  aiServiceUrl: process.env.AI_SERVICE_URL || '',
  corsOrigins: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : [])
  ]
};

module.exports = config;

