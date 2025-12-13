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
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD, // Use App Password, not regular password
      },
    });
  }

  async send(payload: NotificationPayload): Promise<boolean> {
    try {
      const mailOptions = {
        from: process.env.GMAIL_USER,
        to: payload.to,
        subject: payload.subject,
        html: this.buildEmailTemplate(payload),
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      return false;
    }
  }

  getName(): string {
    return 'gmail';
  }

  private buildEmailTemplate(payload: NotificationPayload): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4285f4; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
            .footer { margin-top: 20px; font-size: 12px; color: #666; }
            .metadata { background-color: #e8f0fe; padding: 10px; margin-top: 15px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>${payload.subject}</h2>
            </div>
            <div class="content">
              <p>${payload.body}</p>
              ${
                payload.metadata
                  ? `
                <div class="metadata">
                  <strong>Detalles adicionales:</strong>
                  <pre>${JSON.stringify(payload.metadata, null, 2)}</pre>
                </div>
              `
                  : ''
              }
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
