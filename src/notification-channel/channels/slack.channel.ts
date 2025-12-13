import { Injectable, Logger } from '@nestjs/common';
import {
  INotificationChannel,
  NotificationPayload,
} from '../interfaces/notification-channel.interface';

@Injectable()
export class SlackChannel implements INotificationChannel {
  private readonly logger = new Logger(SlackChannel.name);

  async send(payload: NotificationPayload): Promise<boolean> {
    try {
      // Implementación con Slack Webhook
      const webhookUrl = payload.to; // El webhook URL de Slack

      const message = {
        text: payload.subject,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: payload.subject,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: payload.body,
            },
          },
          ...(payload.metadata
            ? [
                {
                  type: 'section',
                  fields: Object.entries(payload.metadata).map(
                    ([key, value]) => ({
                      type: 'mrkdwn',
                      text: `*${key}:*\n${value}`,
                    }),
                  ),
                },
              ]
            : []),
        ],
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.statusText}`);
      }

      this.logger.log(`Slack message sent successfully`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send Slack message: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  getName(): string {
    return 'slack';
  }
}
