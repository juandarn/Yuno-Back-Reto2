import { Injectable, Logger } from '@nestjs/common';
import {
  INotificationChannel,
  NotificationPayload,
} from '../interfaces/notification-channel.interface';

@Injectable()
export class WhatsAppChannel implements INotificationChannel {
  private readonly logger = new Logger(WhatsAppChannel.name);

  async send(payload: NotificationPayload): Promise<boolean> {
    try {
      // Implementación con Twilio WhatsApp API o WhatsApp Business API
      // Para usar Twilio:
      // const client = require('twilio')(accountSid, authToken);
      // await client.messages.create({
      //   from: 'whatsapp:+14155238886',
      //   body: payload.body,
      //   to: `whatsapp:${payload.to}`
      // });

      this.logger.log(`WhatsApp message would be sent to: ${payload.to}`);
      this.logger.log(`Subject: ${payload.subject}`);
      this.logger.log(`Body: ${payload.body}`);

      // Por ahora retornamos true como placeholder
      // En producción, implementar la lógica real
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp message: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  getName(): string {
    return 'whatsapp';
  }
}
