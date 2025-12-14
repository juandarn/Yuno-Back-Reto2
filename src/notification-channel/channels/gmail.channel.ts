import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  INotificationChannel,
  NotificationPayload,
} from '../interfaces/notification-channel.interface';

@Injectable()
export class GmailChannel implements INotificationChannel {
  private readonly logger = new Logger(GmailChannel.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE ?? 'true') === 'true';

    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      // Esto evita el error críptico "Missing credentials for PLAIN"
      this.logger.error(
        'Faltan credenciales SMTP. Verifica SMTP_USER y SMTP_PASS en tu .env',
      );
      // Dejamos transporter "dummy" para no romper el arranque, pero send() fallará con mensaje claro
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  async send(payload: NotificationPayload): Promise<boolean> {
    try {
      if (!payload?.to) {
        this.logger.error('No se puede enviar email: payload.to está vacío.');
        return false;
      }

      const from = process.env.MAIL_FROM || process.env.SMTP_USER;

      const mailOptions: nodemailer.SendMailOptions = {
        from,
        to: payload.to,
        subject: payload.subject,
        html: this.buildEmailTemplate(payload),
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email enviado: ${info.messageId || 'OK'}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error?.message ?? error}`, error?.stack);
      return false;
    }
  }

  getName(): string {
    return 'gmail';
  }

  private buildEmailTemplate(payload: NotificationPayload): string {
    const metadataHtml = payload.metadata
      ? `
        <div class="metadata">
          <strong>Detalles adicionales:</strong>
          <pre>${escapeHtml(JSON.stringify(payload.metadata, null, 2))}</pre>
        </div>
      `
      : '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4285f4; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
            .footer { margin-top: 20px; font-size: 12px; color: #666; }
            .metadata { background-color: #e8f0fe; padding: 10px; margin-top: 15px; border-radius: 3px; overflow: auto; }
            pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>${escapeHtml(payload.subject || 'Notificación')}</h2>
            </div>
            <div class="content">
              <p>${escapeHtml(payload.body || '')}</p>
              ${metadataHtml}
            </div>
            <div class="footer">
              <p>Este es un mensaje automático del sistema de notificaciones.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
