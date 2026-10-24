import api from './api';
import type { Notification } from '../types';

interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  unread_count: number;
}

export const notificationService = {
  async getNotifications(params?: { page?: number; page_size?: number; unread_only?: boolean }): Promise<NotificationListResponse> {
    const res = await api.get<NotificationListResponse>('/api/notifications', { params });
    return res.data;
  },

  async markAsRead(id: string): Promise<Notification> {
    const res = await api.patch<Notification>(`/api/notifications/${id}/read`);
    return res.data;
  },

  async markAllRead(): Promise<void> {
    await api.patch('/api/notifications/read-all');
  },
};
