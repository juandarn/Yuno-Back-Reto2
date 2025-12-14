import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import {
  CreateAlertDto,
  UpdateAlertDto,
  AlertStatus,
} from './dto/create-alert.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationChannelService } from '../notification-channel/notification-channel.service';
import { OnCallService } from '../on-call/on-call.service';

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    @InjectRepository(Alert)
    private alertRepository: Repository<Alert>,
    private notificationsService: NotificationService,
    private channelsService: NotificationChannelService,
    private onCallService: OnCallService,
  ) {}

  async create(createDto: CreateAlertDto): Promise<Alert> {
    const alert = this.alertRepository.create({
      ...createDto,
      estado: createDto.state || AlertStatus.OPEN,
    });

    const savedAlert = await this.alertRepository.save(alert);

    // Enviar notificaciones automáticamente para alertas críticas
    if (createDto.severity === 'critical') {
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
    return await this.update(id, { state: AlertStatus.ACK });
  }

  async resolve(id: string): Promise<Alert> {
    return await this.update(id, { state: AlertStatus.RESOLVED });
  }

  async remove(id: string): Promise<void> {
    const alert = await this.findOne(id);
    await this.alertRepository.remove(alert);
  }

  private async sendAlertNotifications(alert: Alert): Promise<void> {
    try {
      // Obtener todos los canales activos
      const activeChannels = await this.channelsService.findActive();

      // Resolver destinatario on-call (prioridad 1)
      const onCallSchedule = await this.onCallService.findByPriority(1);
      const onCallUserId =
        onCallSchedule?.user?.id ?? (onCallSchedule as any)?.user_id;
      const onCallEmail =
        onCallSchedule?.user?.email ?? (onCallSchedule as any)?.user?.email;
      const onCallNumber =
        onCallSchedule?.user?.number ?? (onCallSchedule as any)?.user?.number;

      if (!onCallUserId) {
        this.logger.warn(
          'No se encontró un usuario on-call activo con prioridad 1. No se enviarán notificaciones.',
        );
        return;
      }

      for (const channel of activeChannels) {
        // Determinar tipo y destinatario
        let channelType = 'gmail';
        let recipient = onCallEmail || channel.email;

        if (channel.slack) {
          channelType = 'slack';
          recipient = channel.slack;
        } else if (channel.webhook) {
          channelType = 'webhook';
          recipient = channel.webhook;
        } else if (channel.name === 'whatsapp') {
          channelType = 'whatsapp';
          recipient = onCallNumber as string;
        }
        // Crear la notificación en DB con IDs reales
        // Nota: aquí seguimos usando CreateNotificationDto tal como lo tienes (alerta_id/usuario_id/canal_id)
        const notification = await this.notificationsService.create({
          alerta_id: alert.id,
          usuario_id: String(onCallUserId),
          canal_id: channel.id,
          payload: JSON.stringify({
            severity: alert.severity,
            title: alert.title,
            explanation: alert.explanation,
          }),
        });

        // Enviar la notificación
        await this.notificationsService.sendNotification(
          notification.id,
          channelType,
          {
            to: recipient,
            subject: `ALERT ${alert.severity.toUpperCase()}: ${alert.title}`,
            body: 'Check your email for more information.',
            metadata: {
              alertId: alert.id,
              metricId: alert.metric_id,
              severity: alert.severity,
              merchantId: alert.merchant_id,
              timestamp: alert.fecha,
              onCallUserId: onCallUserId,
              onCallScheduleId: onCallSchedule?.id,
            },
          },
        );
      }

      this.logger.log(`Notifications processed for alert ${alert.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to send alert notifications: ${error?.message ?? error}`,
        error?.stack,
      );
      throw error;
    }
  }

  async resendNotifications(alertId: string): Promise<void> {
    const alert = await this.findOne(alertId);
    await this.sendAlertNotifications(alert);
  }
}
