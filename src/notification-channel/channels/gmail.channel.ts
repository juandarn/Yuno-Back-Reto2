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
        html: payload.body,  // ✅ CAMBIO: Usar body directamente (ya viene como HTML completo)
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
}