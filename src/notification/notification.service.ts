import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationChannelFactory } from '../notification-channel/services/notification-channel.factory';
import { NotificationPayload } from '../notification-channel/interfaces/notification-channel.interface';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private channelFactory: NotificationChannelFactory,
  ) {}

  async create(createDto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({
      ...createDto,
      estado: 'pending',
    });
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
      this.logger.error(`Error sending notification: ${error.message}`, error.stack);
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
    const notification = await this.notificationRepository.findOne({ where: { id } });
    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }
    return notification;
  }

  async findByUser(userId: string): Promise<Notification[]> {
    return await this.notificationRepository.find({
      where: { usuario_id: userId },
      order: { enviado_en: 'DESC' },
    });
  }

  async findByAlert(alertId: string): Promise<Notification[]> {
    return await this.notificationRepository.find({
      where: { alerta_id: alertId },
      order: { enviado_en: 'DESC' },
    });
  }

  async updateStatus(id: string, status: string): Promise<Notification> {
    const notification = await this.findOne(id);
    notification.estado = status;
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
