const Notification = require('../models/Notification');

async function getNotifications(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.page_size, 10) || 20, 100);
    const unreadOnly = req.query.unread_only === 'true';

    const query = { user_id: req.user.id };
    if (unreadOnly) {
      query.is_read = false;
    }

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ user_id: req.user.id, is_read: false });

    const notifications = await Notification.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize);

    return res.json({
      notifications: notifications.map(n => n.toJSON()),
      total,
      unread_count: unreadCount
    });
  } catch (err) {
    next(err);
  }
}

async function markAsRead(req, res, next) {
  try {
    const notif = await Notification.findOneAndUpdate(
      {
        $or: [{ id: req.params.notification_id }, { _id: req.params.notification_id }],
        user_id: req.user.id
      },
      { $set: { is_read: true } },
      { new: true }
    );

    if (!notif) {
      return res.status(404).json({ detail: 'Notification not found' });
    }

    return res.json(notif.toJSON());
  } catch (err) {
    next(err);
  }
}

async function markAllRead(req, res, next) {
  try {
    await Notification.updateMany(
      { user_id: req.user.id, is_read: false },
      { $set: { is_read: true } }
    );
    return res.status(200).json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllRead
};

