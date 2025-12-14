import { Injectable, Logger } from '@nestjs/common';
import twilio, { Twilio } from 'twilio';

import {
  INotificationChannel,
  NotificationPayload,
} from '../interfaces/notification-channel.interface';

@Injectable()
export class WhatsAppChannel implements INotificationChannel {
  private readonly logger = new Logger(WhatsAppChannel.name);
  private readonly client?: twilio.Twilio;
  private readonly fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH;
    this.fromNumber = this.formatWhatsAppNumber(
      process.env.TWILIO_FROM_NUMBER || '+14155238886',
    );

    if (!accountSid || !authToken) {
      this.logger.warn(
        'Twilio credentials not configured. WhatsApp notifications will be logged only.',
      );
    } else {
      this.client = twilio(accountSid, authToken);
    }
  }

  async send(payload: NotificationPayload): Promise<boolean> {
    try {
      // Si no hay cliente configurado, solo logueamos
      if (!this.client) {
        this.logger.log(`WhatsApp message would be sent to: ${payload.to}`);
        this.logger.log(`Subject: ${payload.subject}`);
        this.logger.log(`Body: ${payload.body}`);
        return true;
      }

      // Formatear el número destino
      const toNumber = this.formatWhatsAppNumber(payload.to);
      console.log(toNumber);

      // Construir el mensaje (incluir subject si existe)
      const messageBody = payload.subject
        ? `*${payload.subject}*\n\n${payload.body}`
        : payload.body;

      // Validar longitud del mensaje (límite de WhatsApp: 1600 caracteres)
      if (messageBody.length > 1600) {
        this.logger.warn(
          `Message too long (${messageBody.length} chars), truncating to 1600 chars`,
        );
      }

      const truncatedBody = messageBody.substring(0, 1600);

      // Enviar mensaje
      const message = await this.client.messages.create({
        from: this.fromNumber,
        to: toNumber,
        body: truncatedBody,
      });

      this.logger.log(
        `WhatsApp message sent successfully. SID: ${message.sid}, Status: ${message.status}`,
      );

      // El estado puede ser: queued, sending, sent, failed, delivered, undelivered
      return ['queued', 'sending', 'sent', 'delivered'].includes(
        message.status,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp message: ${error.message}`,
        error.stack,
      );

      // Loguear detalles específicos del error de Twilio
      if (error.code) {
        this.logger.error(`Twilio Error Code: ${error.code}`);
      }
      if (error.moreInfo) {
        this.logger.error(`More info: ${error.moreInfo}`);
      }

      return false;
    }
  }

  /**
   * Formatea el número de teléfono al formato requerido por WhatsApp
   * Acepta: +573001234567, 3001234567, whatsapp:+573001234567
   */
  private formatWhatsAppNumber(phoneNumber: string): string {
    // Si ya tiene el prefijo whatsapp:, retornarlo
    if (phoneNumber.startsWith('whatsapp:')) {
      return phoneNumber;
    }

    // Remover espacios y caracteres especiales
    let cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');

    // Si no tiene +, agregarlo (asumiendo que viene con código de país)
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return `whatsapp:${cleaned}`;
  }

  getName(): string {
    return 'whatsapp';
  }
}
