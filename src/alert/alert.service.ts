import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { CreateAlertDto, UpdateAlertDto, AlertStatus } from './dto/create-alert.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationChannelService } from '../notification-channel/notification-channel.service';

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    @InjectRepository(Alert)
    private alertRepository: Repository<Alert>,
    private notificationsService: NotificationService,
    private channelsService: NotificationChannelService,
  ) {}

  async create(createDto: CreateAlertDto): Promise<Alert> {
    const alert = this.alertRepository.create({
      ...createDto,
      estado: createDto.estado || AlertStatus.OPEN,
    });
    const savedAlert = await this.alertRepository.save(alert);

    // Enviar notificaciones automáticamente para alertas críticas
    if (createDto.severidad === 'critical') {
      await this.sendAlertNotifications(savedAlert);
    }

    return savedAlert;
  }

  async findAll(): Promise<Alert[]> {
    return await this.alertRepository.find({
      order: { fecha: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Alert> {
    const alert = await this.alertRepository.findOne({ where: { id } });
    if (!alert) {
      throw new NotFoundException(`Alert with ID ${id} not found`);
    }
    return alert;
  }

  async findByStatus(status: AlertStatus): Promise<Alert[]> {
    return await this.alertRepository.find({
      where: { estado: status },
      order: { fecha: 'DESC' },
    });
  }

  async findByMerchant(merchantId: string): Promise<Alert[]> {
    return await this.alertRepository.find({
      where: { merchant_id: merchantId },
      order: { fecha: 'DESC' },
    });
  }

  async update(id: string, updateDto: UpdateAlertDto): Promise<Alert> {
    const alert = await this.findOne(id);
    Object.assign(alert, updateDto);
    return await this.alertRepository.save(alert);
  }

  async acknowledge(id: string): Promise<Alert> {
    return await this.update(id, { estado: AlertStatus.ACK });
  }

  async resolve(id: string): Promise<Alert> {
    return await this.update(id, { estado: AlertStatus.RESOLVED });
  }

  async remove(id: string): Promise<void> {
    const alert = await this.findOne(id);
    await this.alertRepository.remove(alert);
  }

  private async sendAlertNotifications(alert: Alert): Promise<void> {
    try {
      // Obtener todos los canales activos
      const activeChannels = await this.channelsService.findActive();

      for (const channel of activeChannels) {
        // Determinar el tipo de canal basado en la configuración
        let channelType = 'gmail'; // Default
        let recipient = channel.email;

        if (channel.slack) {
          channelType = 'slack';
          recipient = channel.slack;
        } else if (channel.webhook) {
          channelType = 'webhook';
          recipient = channel.webhook;
        }

        // Crear la notificación en la base de datos
        const notification = await this.notificationsService.create({
          alerta_id: alert.id,
          usuario_id: 'system', // O usar el merchant_id si está disponible
          canal_id: channel.id,
          payload: JSON.stringify({
            severity: alert.severidad,
            title: alert.titulo,
            explanation: alert.explicacion,
          }),
        });

        // Enviar la notificación
        await this.notificationsService.sendNotification(
          notification.id,
          channelType,
          {
            to: recipient,
            subject: `🚨 ${alert.severidad.toUpperCase()}: ${alert.titulo}`,
            body: alert.explicacion || 'No hay detalles adicionales disponibles.',
            metadata: {
              alertId: alert.id,
              metricId: alert.metric_id,
              severity: alert.severidad,
              merchantId: alert.merchant_id,
              timestamp: alert.fecha,
            },
          },
        );
      }

      this.logger.log(`Notifications sent for alert ${alert.id}`);
    } catch (error) {
      this.logger.error(`Failed to send alert notifications: ${error.message}`, error.stack);
    }
  }

  async resendNotifications(alertId: string): Promise<void> {
    const alert = await this.findOne(alertId);
    await this.sendAlertNotifications(alert);
  }
}
