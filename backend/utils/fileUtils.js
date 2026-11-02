const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/config');

function calculateContentHash(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return resolve(null);
    }
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}

function ensureUploadDir(subfolder = '') {
  const targetDir = subfolder
    ? path.join(config.uploadDir, subfolder)
    : config.uploadDir;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

function deleteUploadFile(filePath) {
  if (!filePath) return;
  try {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(config.uploadDir, filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.warn(`Failed to delete file ${filePath}: ${err.message}`);
  }
}

function resolveFilePath(filePath) {
  if (!filePath) return '';
  if (fs.existsSync(filePath)) return filePath;
  const relativeToUploads = path.join(config.uploadDir, filePath);
  if (fs.existsSync(relativeToUploads)) return relativeToUploads;
  const relativeToBackend = path.resolve(__dirname, '..', filePath);
  if (fs.existsSync(relativeToBackend)) return relativeToBackend;
  return filePath;
}

module.exports = {
  calculateContentHash,
  ensureUploadDir,
  deleteUploadFile,
  resolveFilePath
};

