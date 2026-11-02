const AuditLog = require('../models/AuditLog');

function getClientIp(req) {
  if (!req) return null;
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || null;
}

async function createAuditLog({
  userId = null,
  action,
  entityType,
  entityId = null,
  oldValue = null,
  newValue = null,
  req = null
}) {
  try {
    const ipAddress = req ? getClientIp(req) : null;
    const userAgent = req ? req.headers['user-agent'] : null;

    const log = new AuditLog({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      old_value: oldValue,
      new_value: newValue,
      ip_address: ipAddress,
      user_agent: userAgent
    });

    await log.save();
    return log;
  } catch (err) {
    console.warn(`[AuditLog] Warning: failed to write audit log: ${err.message}`);
    return null;
  }
}

module.exports = {
  createAuditLog,
  getClientIp
};

