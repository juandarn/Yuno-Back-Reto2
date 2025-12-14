import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationChannelFactory } from '../notification-channel/services/notification-channel.factory';
import { NotificationPayload } from '../notification-channel/interfaces/notification-channel.interface';

// Importa las entidades para tipar las relaciones (si existen)
import { Alert } from '../alert/entities/alert.entity';
import { User } from '../user/entities/user.entity';
import { NotificationChannel } from '../notification-channel/entities/notification-channel.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private channelFactory: NotificationChannelFactory,
  ) {}

  async create(createDto: CreateNotificationDto): Promise<Notification> {
    // payload puede venir string o JSON
    const parsedPayload =
      typeof createDto.payload === 'string'
        ? safeJsonParse(createDto.payload)
        : createDto.payload;

    // IMPORTANTE:
    // La tabla exige alert_id NOT NULL.
    // Si tu entity Notification está basada en relaciones (alert, user, channel), hay que setearlas así.
    // Si tu entity usa columnas directas (alert_id, user_id, channel_id), también se puede, pero esto funciona en ambos casos si hay relaciones.
    const notificationData: DeepPartial<Notification> = {
      estado: 'pending',
      payload: parsedPayload,

      // Relaciones (recomendado). TypeORM generará alert_id / user_id / channel_id.
      alert: { id: createDto.alerta_id } as Alert,
      user: { id: createDto.usuario_id } as unknown as User,
      channel: { id: createDto.canal_id } as NotificationChannel,
    };
    const notification = this.notificationRepository.create(notificationData);

    return await this.notificationRepository.save(notification);
  }

  async sendNotification(
    notificationId: string,
    channelType: string,
    payload: NotificationPayload,
  ): Promise<boolean> {
    const channel = this.channelFactory.getChannel(channelType);

    if (!channel) {
      this.logger.error(`Channel not found: ${channelType}`);
      await this.updateStatus(notificationId, 'failed');
      return false;
    }

    try {
      const success = await channel.send(payload);
      await this.updateStatus(notificationId, success ? 'sent' : 'failed');
      return success;
    } catch (error) {
      this.logger.error(
        `Error sending notification: ${error?.message ?? error}`,
        error?.stack,
      );
      await this.updateStatus(notificationId, 'failed');
      return false;
    }
  }

  async findAll(): Promise<Notification[]> {
    return await this.notificationRepository.find({
      order: { enviado_en: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }
    return notification;
  }

  async findByUser(userId: string): Promise<Notification[]> {
    return await this.notificationRepository.find({
      where: { user_id: userId },
      order: { enviado_en: 'DESC' },
    });
  }

  async findByAlert(alertId: string): Promise<Notification[]> {
    return await this.notificationRepository.find({
      where: { alert_id: alertId },
      order: { enviado_en: 'DESC' },
    });
  }

  async updateStatus(id: string, status: string): Promise<Notification> {
    const notification = await this.findOne(id);
    notification.estado = status;

    // Si tu entidad tiene enviado_en, setearlo al enviar
    if (status === 'sent') {
      (notification as any).enviado_en = new Date();
    }

    return await this.notificationRepository.save(notification);
  }

  async remove(id: string): Promise<void> {
    const notification = await this.findOne(id);
    await this.notificationRepository.remove(notification);
  }

  getAvailableChannels(): string[] {
    return this.channelFactory.getAvailableChannels();
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value; // si no es JSON válido, guarda el string tal cual
  }
}
