const Notification = require('../models/Notification');
const websocketManager = require('./websocketService');

async function createNotification({
  userId,
  type,
  title,
  message,
  claimId = null
}) {
  try {
    const notif = new Notification({
      user_id: userId,
      type,
      title,
      message,
      claim_id: claimId,
      is_read: false
    });
    await notif.save();

    // Push real-time notification via WebSocket
    websocketManager.sendToUser(userId, {
      type: 'NOTIFICATION',
      data: {
        id: notif.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        claim_id: notif.claim_id,
        created_at: notif.created_at
      }
    });

    return notif;
  } catch (err) {
    console.warn(`[Notification] Failed to create notification: ${err.message}`);
    return null;
  }
}

async function notifyClaimSubmitted(claim, customerId) {
  return createNotification({
    userId: customerId,
    type: 'CLAIM_SUBMITTED',
    title: 'Claim Submitted Successfully',
    message: `Your claim ${claim.claim_number} for ₹${Number(claim.requested_amount).toLocaleString('en-IN')} has been submitted and is currently being processed.`,
    claimId: claim.id
  });
}

async function notifyClaimApproved(claim, customerId) {
  return createNotification({
    userId: customerId,
    type: 'CLAIM_APPROVED',
    title: 'Claim Approved',
    message: `Great news! Your claim ${claim.claim_number} has been approved for ₹${Number(claim.approved_amount).toLocaleString('en-IN')}. Settlement will follow shortly.`,
    claimId: claim.id
  });
}

async function notifyClaimRejected(claim, customerId, reason) {
  return createNotification({
    userId: customerId,
    type: 'CLAIM_REJECTED',
    title: 'Claim Rejected',
    message: `Your claim ${claim.claim_number} was not approved. Reason: ${reason || 'Does not meet policy criteria'}.`,
    claimId: claim.id
  });
}

async function notifyDocumentRequested(claim, customerId, message) {
  return createNotification({
    userId: customerId,
    type: 'DOCUMENT_REQUESTED',
    title: 'Additional Documents Required',
    message: `Action required for claim ${claim.claim_number}: ${message}`,
    claimId: claim.id
  });
}

async function notifySettlementCompleted(claim, customerId) {
  return createNotification({
    userId: customerId,
    type: 'SETTLEMENT_COMPLETED',
    title: 'Settlement Payout Completed',
    message: `The settlement payout for claim ${claim.claim_number} has been completed and disbursed.`,
    claimId: claim.id
  });
}

module.exports = {
  createNotification,
  notifyClaimSubmitted,
  notifyClaimApproved,
  notifyClaimRejected,
  notifyDocumentRequested,
  notifySettlementCompleted
};

