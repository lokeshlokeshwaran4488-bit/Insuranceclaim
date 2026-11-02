const crypto = require('crypto');
const config = require('../config/config');

// Standard 32-byte key for AES-256-CBC
function getKey() {
  const rawKey = config.aesKey || '12345678901234567890123456789012';
  return crypto.createHash('sha256').update(rawKey).digest();
}

function encryptSensitiveData(plainText) {
  if (!plainText) return null;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
    let encrypted = cipher.update(String(plainText), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('Encryption error:', err);
    return null;
  }
}

function decryptSensitiveData(cipherText) {
  if (!cipherText || !cipherText.includes(':')) return null;
  try {
    const [ivHex, encrypted] = cipherText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption error:', err);
    return null;
  }
}

module.exports = {
  encryptSensitiveData,
  decryptSensitiveData
};

