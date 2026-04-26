/**
 * RealTimeService — thin wrapper around SocketServer for application-level
 * real-time notifications.
 *
 * All emission goes through the SocketServer singleton so there is always a
 * single Socket.IO Server instance in the process.
 */

import { SocketServer, SERVER_EVENTS, ROOMS } from './SocketServer';

export enum NotificationType {
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  BILL_GENERATED = 'BILL_GENERATED',
  SYSTEM_ALERT = 'SYSTEM_ALERT',
}

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  data?: unknown;
  timestamp: string;
}

export class RealTimeService {
  /**
   * Send a typed notification to a specific user's private room.
   */
  static sendUserUpdate(userId: string, type: NotificationType, data: unknown): void {
    try {
      const socketServer = SocketServer.getInstance();

      const payload: NotificationPayload = {
        type,
        title: RealTimeService.getTitleForType(type),
        message: RealTimeService.getMessageForType(type, data),
        data,
        timestamp: new Date().toISOString(),
      };

      // Emit the generic notification event
      socketServer.sendNotification(userId, payload);

      // Also emit a granular event so clients can listen selectively
      socketServer.emitToUser(userId, type.toLowerCase(), data);

      console.log(`[RealTimeService] Sent ${type} to user ${userId}`);
    } catch (error) {
      console.error(`[RealTimeService] Failed to send ${type} to user ${userId}:`, error);
    }
  }

  /**
   * Broadcast a message to every connected authenticated user.
   */
  static broadcast(type: NotificationType, data: unknown): void {
    try {
      SocketServer.getInstance().broadcast(SERVER_EVENTS.BROADCAST, {
        type,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[RealTimeService] Failed to broadcast message:', error);
    }
  }

  /**
   * Send a system-wide alert to the notifications room.
   * All users who have subscribed to `room_notifications` will receive it.
   */
  static sendSystemAlert(message: string, data?: unknown): void {
    try {
      SocketServer.getInstance().emitToRoom(ROOMS.notifications, SERVER_EVENTS.NOTIFICATION, {
        type: NotificationType.SYSTEM_ALERT,
        title: 'System Alert',
        message,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[RealTimeService] Failed to send system alert:', error);
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private static getTitleForType(type: NotificationType): string {
    switch (type) {
      case NotificationType.PAYMENT_SUCCESS: return 'Payment Successful';
      case NotificationType.PAYMENT_FAILED:  return 'Payment Failed';
      case NotificationType.PAYMENT_PENDING: return 'Payment Processing';
      case NotificationType.BILL_GENERATED:  return 'New Bill Available';
      case NotificationType.SYSTEM_ALERT:    return 'System Alert';
      default: return 'Notification';
    }
  }

  private static getMessageForType(type: NotificationType, data: any): string {
    switch (type) {
      case NotificationType.PAYMENT_SUCCESS:
        return `Your payment of ₦${data?.amount} was successful.`;
      case NotificationType.PAYMENT_FAILED:
        return `Payment failed: ${data?.reason ?? 'Unknown error'}`;
      case NotificationType.BILL_GENERATED:
        return `A new bill for ${data?.utilityName} is ready.`;
      default:
        return 'You have a new notification.';
    }
  }
}
