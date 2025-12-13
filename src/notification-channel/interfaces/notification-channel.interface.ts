export interface NotificationPayload {
  to: string;
  subject: string;
  body: string;
  metadata?: Record<string, any>;
}

export interface INotificationChannel {
  send(payload: NotificationPayload): Promise<boolean>;
  getName(): string;
}
