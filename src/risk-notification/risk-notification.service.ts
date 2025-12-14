import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull, MoreThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RiskNotification } from '../risk-notification/entities/risk-notification.entity';
import { FailurePredictionService } from '../failure-prediction/failure-prediction.service';
import { NotificationService } from '../notification/notification.service';
import { AlertService } from '../alert/alert.service';
import { User } from '../user/entities/user.entity';
import { NotificationChannel } from '../notification-channel/entities/notification-channel.entity';
import { AlertSeverity } from '../alert/dto/create-alert.dto';
import { FailureProbability } from '../failure-prediction/dto/failure-prediction.dto';

@Injectable()
export class RiskNotificationService {
  private readonly logger = new Logger(RiskNotificationService.name);

  // Configuración
  private readonly GUARD_NOTIFICATION_INTERVAL_MINUTES = 10; // Tiempo entre intentos al guardia
  private readonly MAX_GUARD_ATTEMPTS = 3; // Máximo de intentos antes de escalar
  private readonly RISK_CHECK_INTERVAL_MINUTES = 5; // Cada cuánto revisar riesgos

  constructor(
    @InjectRepository(RiskNotification)
    private riskNotificationRepository: Repository<RiskNotification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(NotificationChannel)
    private channelRepository: Repository<NotificationChannel>,
    private failurePredictionService: FailurePredictionService,
    private notificationService: NotificationService,
    private alertService: AlertService,
  ) {}

  async listMinimal(status?: string, page = 1, limit = 20) {
    const qb = this.riskNotificationRepository
      .createQueryBuilder('rn')
      .select([
        'rn.id',
        'rn.entity_type',
        'rn.entity_name',
        'rn.risk_level',
        'rn.status',
      ]);

    if (status) qb.where('rn.status = :status', { status });

    qb.orderBy('rn.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items,
    };
  }

  /**
   * Cron job principal - Ejecuta cada 5 minutos
   * Revisa predicciones y gestiona notificaciones
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndNotifyRisks() {
    this.logger.log('🔍 Iniciando revisión periódica de riesgos...');

    try {
      // 1. Obtener predicciones actuales
      const predictions = await this.failurePredictionService.getPredictions({
        entity_type: 'merchant',
        time_window_minutes: 10800,
        include_low_risk: false,
      });

      const providerPredictions =
        await this.failurePredictionService.getPredictions({
          entity_type: 'provider',
          time_window_minutes: 10800,
          include_low_risk: false,
        });

      const allPredictions = [
        ...predictions.predictions,
        ...providerPredictions.predictions,
      ];

      // Filtrar solo MEDIUM, HIGH, CRITICAL
      const riskyEntities = allPredictions.filter(
        (p) =>
          p.risk_level === 'medium' ||
          p.risk_level === 'high' ||
          p.risk_level === 'critical',
      );

      this.logger.log(
        `📊 Encontradas ${riskyEntities.length} entidades en riesgo`,
      );

      // 2. Procesar cada entidad en riesgo
      for (const entity of riskyEntities) {
        await this.processRiskyEntity(entity);
      }

      // 3. Revisar notificaciones pendientes del guardia
      //await this.checkPendingGuardNotifications();

      // 4. Limpiar notificaciones resueltas antiguas (opcional)
      await this.cleanupOldNotifications();

      this.logger.log('✅ Revisión periódica completada');
    } catch (error) {
      this.logger.error('❌ Error en revisión periódica:', error);
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkGuardRetries() {
    await this.checkPendingGuardNotifications();
  }

  /**
   * Procesa una entidad en riesgo
   */
  private async processRiskyEntity(entity: FailureProbability) {
    // Verificar si ya existe una notificación activa para esta entidad
    const existingNotification = await this.riskNotificationRepository.findOne({
      where: {
        entity_type: entity.entity_type,
        entity_id: entity.entity_id,
        status: 'guard_notified' as any,
        resolved: false,
      },
    });

    if (existingNotification) {
      // Ya existe notificación activa - actualizar si el riesgo cambió
      if (existingNotification.risk_level !== entity.risk_level) {
        this.logger.log(
          `⚠️ Riesgo cambió para ${entity.entity_name}: ${existingNotification.risk_level} → ${entity.risk_level}`,
        );
        existingNotification.risk_level = entity.risk_level;
        existingNotification.probability = entity.probability;
        await this.riskNotificationRepository.save(existingNotification);
      }
      return; // No re-notificar
    }

    // Verificar si fue descartada recientemente (últimas 24h)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentlyDismissed = await this.riskNotificationRepository.findOne({
      where: {
        entity_type: entity.entity_type,
        entity_id: entity.entity_id,
        dismissed_by_guard: true,
        dismissed_at: MoreThan(cutoff),
      },
    });

    if (recentlyDismissed) {
      this.logger.log(
        `🚫 ${entity.entity_name} fue descartada recientemente - no notificar`,
      );
      return;
    }

    // Nueva entidad en riesgo - notificar al guardia
    await this.notifyGuard(entity);
  }

  /**
   * Notifica al guardia de turno sobre una entidad en riesgo
   */
  private async notifyGuard(entity: FailureProbability) {
    this.logger.log(
      `🚨 Nueva entidad en riesgo detectada: ${entity.entity_name} (${entity.risk_level})`,
    );

    // Obtener guardia de turno
    const guardUser = await this.getOnCallGuard();
    if (!guardUser) {
      this.logger.error(
        '❌ No hay guardia de turno disponible - escalando directamente',
      );
      await this.escalateToAll(entity, null);
      return;
    }

    // Crear alerta
    const alert = await this.alertService.create({
      severity: this.mapRiskToSeverity(entity.risk_level),
      title: `⚠️ Risk ${entity.risk_level.toUpperCase()} detected: ${entity.entity_name}`,
      explanation: this.buildAlertExplanation(entity),
      merchant_id:
        entity.entity_type === 'merchant' ? entity.entity_id : undefined,
    });

    // Registrar notificación de riesgo
    const riskNotification = this.riskNotificationRepository.create({
      entity_type: entity.entity_type,
      entity_id: entity.entity_id,
      entity_name: entity.entity_name,
      risk_level: entity.risk_level,
      probability: entity.probability,
      status: 'guard_notified',
      guard_attempts: 1,
      last_guard_notification: new Date(),
      guard_user_id: guardUser.id,
      metadata: {
        signals: entity.signals,
        baseline_comparison: entity.baseline_comparison,
        trend: entity.trend,
        recommended_actions: entity.recommended_actions,
      },
    });

    await this.riskNotificationRepository.save(riskNotification);

    // Enviar notificación al guardia
    await this.sendGuardNotification(guardUser, alert, riskNotification);

    this.logger.log(
      `✉️ Guard notified: ${guardUser.name} (${guardUser.email})`,
    );
  }

  /**
   * Envía notificación al guardia por email
   */
  private async sendGuardNotification(
    guardUser: User,
    alert: any,
    riskNotification: RiskNotification,
  ) {
    const subject = `🚨 [GUARD] Risk ${riskNotification.risk_level.toUpperCase()}: ${riskNotification.entity_name}`;
    const emailBody = this.buildGuardEmailBody(riskNotification, guardUser);

    // 1) EMAIL (como ya lo tienes)
    const emailChannel = await this.channelRepository.findOne({
      where: { name: 'gmail', activo: true },
    });

    if (emailChannel) {
      const notification = await this.notificationService.create({
        alerta_id: alert.id,
        usuario_id: guardUser.id,
        canal_id: emailChannel.id,
        payload: JSON.stringify({
          to: guardUser.email,
          subject,
          body: emailBody,
        }), // no lo stringifiques, tu service lo soporta
      });

      await this.notificationService.sendNotification(
        notification.id,
        'gmail',
        {
          to: guardUser.email,
          subject,
          body: emailBody,
        },
      );
    } else {
      this.logger.warn('Canal gmail no disponible');
    }

    // 2) WHATSAPP (nuevo)
    const whatsappChannel = await this.channelRepository.findOne({
      where: { name: 'whatsapp', activo: true },
    });

    const toWhatsApp = this.formatWhatsAppTo(
      (guardUser as any).number ?? (guardUser as any).number,
    );

    console.log(toWhatsApp);

    if (!whatsappChannel) {
      this.logger.warn('Canal whatsapp no disponible');
      return;
    }

    if (!toWhatsApp) {
      this.logger.warn(
        `Usuario ${guardUser.id} no tiene phone/cellphone para WhatsApp`,
      );
      return;
    }

    // WhatsApp: mejor mandar texto plano corto (no HTML)
    const waBody = this.buildGuardWhatsAppBody(riskNotification, guardUser);

    const waNotif = await this.notificationService.create({
      alerta_id: alert.id,
      usuario_id: guardUser.id,
      canal_id: whatsappChannel.id,
      payload: JSON.stringify({ to: toWhatsApp, subject, body: waBody }),
    });

    await this.notificationService.sendNotification(waNotif.id, 'whatsapp', {
      to: toWhatsApp,
      subject, // en tu WhatsAppChannel lo pone en negrita
      body: waBody,
    });
  }

  /**
   * Revisa notificaciones pendientes del guardia
   * Si ya pasó el intervalo, reintenta (máximo 3) o escala
   */
  private async checkPendingGuardNotifications() {
    const cutoff = new Date(
      Date.now() - this.GUARD_NOTIFICATION_INTERVAL_MINUTES * 60 * 1000,
    );

    const pendingNotifications = await this.riskNotificationRepository.find({
      where: {
        status: 'guard_notified' as any,
        escalated_to_all: false,
        dismissed_by_guard: false,
        resolved: false,
        last_guard_notification: LessThan(cutoff),
      },
    });

    for (const notification of pendingNotifications) {
      if (notification.guard_attempts < this.MAX_GUARD_ATTEMPTS) {
        await this.retryGuardNotification(notification);
      } else {
        this.logger.warn(
          `⏰ Guardia no respondió después de ${this.MAX_GUARD_ATTEMPTS} intentos - escalando ${notification.entity_name}`,
        );
        await this.escalateToAll(null, notification);
      }
    }
  }

  /**
   * Reintenta notificación al guardia
   */
  private async retryGuardNotification(notification: RiskNotification) {
    notification.guard_attempts += 1;
    notification.last_guard_notification = new Date();
    await this.riskNotificationRepository.save(notification);

    const guardUser = await this.userRepository.findOne({
      where: { id: notification.guard_user_id },
    });

    if (guardUser) {
      this.logger.log(
        `🔔 Reintento ${notification.guard_attempts}/${this.MAX_GUARD_ATTEMPTS} para ${notification.entity_name}`,
      );

      // Crear nueva alerta
      const alert = await this.alertService.create({
        severity: this.mapRiskToSeverity(notification.risk_level),
        title: `⚠️ [REMINDER ${notification.guard_attempts}] Risk ${notification.risk_level.toUpperCase()}: ${notification.entity_name}`,
        explanation: `Este es el intento ${notification.guard_attempts} de ${this.MAX_GUARD_ATTEMPTS}.\n\nSi no se recibe respuesta, se escalará automáticamente a todo el equipo.`,
      });

      await this.sendGuardNotification(guardUser, alert, notification);
    }
  }

  /**
   * Escala la notificación a todos los empleados de Yuno
   */
  private async escalateToAll(
    entity: FailureProbability | null,
    notification: RiskNotification | null,
  ) {
    let riskNotification = notification;

    if (riskNotification == null) {
      if (entity == null) return; // o lanza error si entity es obligatoria
      riskNotification = this.riskNotificationRepository.create({
        entity_type: entity.entity_type,
        entity_id: entity.entity_id,
        entity_name: entity.entity_name,
        risk_level: entity.risk_level,
        probability: entity.probability,
        status: 'escalated',
        guard_attempts: 0,
        escalated_to_all: true,
        escalated_at: new Date(),
      });
    } else {
      riskNotification.status = 'escalated' as any;
      riskNotification.escalated_to_all = true;
      riskNotification.escalated_at = new Date();
    }

    // esto corre para ambos casos (nuevo o existente)
    await this.riskNotificationRepository.save(riskNotification);

    const yunoUsers = await this.userRepository.find({
      where: { type: 'YUNO', active: true },
    });

    this.logger.log(
      `📢 Escalando ${riskNotification!.entity_name} a ${yunoUsers.length} empleados de Yuno`,
    );

    const alert = await this.alertService.create({
      severity: AlertSeverity.CRITICAL,
      title: `🚨 [ESCALATED] CRITICAL Risk: ${riskNotification!.entity_name}`,
      explanation:
        `This alert was automatically escalated after ${riskNotification!.guard_attempts} unanswered on-call guard attempts.\n\n` +
        `Immediate attention from the entire team is required.`,
    });

    // Canales
    const emailChannel = await this.channelRepository.findOne({
      where: { name: 'gmail', activo: true },
    });

    const whatsappChannel = await this.channelRepository.findOne({
      where: { name: 'whatsapp', activo: true },
    });

    if (!emailChannel && !whatsappChannel) {
      this.logger.error('No hay canales disponibles (gmail/whatsapp)');
      return;
    }

    const emailSubject = `🚨 [CRITICAL] Risk detected: ${riskNotification!.entity_name}`;
    const emailBody = this.buildEscalatedEmailBody(riskNotification!);

    const waSubject = `🚨 [CRITICAL] ${riskNotification!.entity_name}`;
    const waBody = this.buildEscalatedWhatsAppBody(riskNotification!);

    for (const user of yunoUsers) {
      // 1) Gmail
      if (emailChannel && user.email) {
        const n = await this.notificationService.create({
          alerta_id: alert.id,
          usuario_id: user.id,
          canal_id: emailChannel.id,
          payload: JSON.stringify({
            to: user.email,
            subject: emailSubject,
            body: emailBody,
          }),
        });

        await this.notificationService.sendNotification(n.id, 'gmail', {
          to: user.email,
          subject: emailSubject,
          body: emailBody,
        });
      }

      // 2) WhatsApp
      if (whatsappChannel) {
        const toWa = this.formatWhatsAppTo(
          (user as any).cellphone ?? (user as any).phone,
        );

        if (!toWa) {
          this.logger.warn(
            `Usuario ${user.id} sin phone/cellphone para WhatsApp`,
          );
          continue;
        }

        const n = await this.notificationService.create({
          alerta_id: alert.id,
          usuario_id: user.id,
          canal_id: whatsappChannel.id,
          payload: JSON.stringify({
            to: toWa,
            subject: waSubject,
            body: waBody,
          }),
        });

        await this.notificationService.sendNotification(n.id, 'whatsapp', {
          to: toWa,
          subject: waSubject,
          body: waBody,
        });
      }
    }

    this.logger.log(
      `✅ Escalación enviada a ${yunoUsers.length} usuarios (gmail/whatsapp)`,
    );
    this.logger.log(
      `✅ Notificación escalada enviada a ${yunoUsers.length} empleados`,
    );
  }

  /**
   * Descarta una notificación de riesgo (llamado desde el frontend por el guardia)
   */
  async dismissRiskNotification(
    notificationId: string,
    userId: string,
    reason: string,
  ): Promise<RiskNotification> {
    const notification = await this.riskNotificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error('Notificación no encontrada');
    }

    notification.dismissed_by_guard = true;
    notification.dismissed_by_user_id = userId;
    notification.dismissed_at = new Date();
    notification.dismissal_reason = reason;
    notification.status = 'dismissed' as any;

    await this.riskNotificationRepository.save(notification);

    this.logger.log(
      `✅ Notificación descartada por guardia: ${notification.entity_name}`,
    );

    return notification;
  }

  /**
   * Propaga/escala manualmente una notificación (llamado desde el frontend por el guardia)
   */
  async propagateRiskNotification(notificationId: string): Promise<void> {
    const notification = await this.riskNotificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error('Notificación no encontrada');
    }

    this.logger.log(
      `📢 Guardia decidió propagar manualmente: ${notification.entity_name}`,
    );

    await this.escalateToAll(null, notification);
  }

  /**
   * Marca una notificación como resuelta
   */
  async markAsResolved(notificationId: string): Promise<RiskNotification> {
    const notification = await this.riskNotificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error('Notificación no encontrada');
    }

    notification.resolved = true;
    notification.resolved_at = new Date();
    notification.status = 'resolved' as any;

    await this.riskNotificationRepository.save(notification);

    this.logger.log(
      `✅ Notificación marcada como resuelta: ${notification.entity_name}`,
    );

    return notification;
  }

  /**
   * Limpia notificaciones antiguas resueltas (más de 7 días)
   */
  private async cleanupOldNotifications() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const result = await this.riskNotificationRepository
      .createQueryBuilder()
      .delete()
      .where('resolved = true')
      .andWhere('resolved_at < :sevenDaysAgo', { sevenDaysAgo })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(
        `🗑️ Limpiadas ${result.affected} notificaciones antiguas`,
      );
    }
  }

  /**
   * Obtiene el guardia de turno actual
   */
  private async getOnCallGuard(): Promise<User | null> {
    // TODO: Integrar con el sistema on-call existente
    // Por ahora, obtener el primer usuario YUNO activo
    const guard = await this.userRepository.findOne({
      where: { type: 'YUNO', active: true },
      order: { name: 'ASC' },
    });

    return guard;
  }

  /**
   * Construye el cuerpo del email para el guardia
   */
  private buildGuardEmailBody(
    notification: RiskNotification,
    guardUser: User,
  ): string {
    const metadata = notification.metadata || {};

    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080'; // set your real port

    const propagateUrl = `${BACKEND_URL}/risk-notifications/${notification.id}/propagate`;
    const dismissUrl =
      `${BACKEND_URL}/risk-notifications/${notification.id}/dismiss` +
      `?user_id=${encodeURIComponent(guardUser.id)}` +
      `&reason=${encodeURIComponent('False positive')}`;

    return `

<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f44336; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .risk-badge { display: inline-block; padding: 5px 10px; border-radius: 3px; font-weight: bold; }
    .risk-critical { background: #f44336; color: white; }
    .risk-high { background: #ff9800; color: white; }
    .risk-medium { background: #ffc107; color: #333; }
    .actions { margin-top: 20px; }
    .button { display: inline-block; padding: 10px 20px; margin: 5px; text-decoration: none; border-radius: 5px; }
    .btn-propagate { background: #f44336; color: white; }
    .btn-dismiss { background: #4caf50; color: white; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🚨 RISK ALERT - Action Required</h2>
    </div>
    
    <div class="content">
      <p>Hello <strong>${guardUser.name}</strong>,</p>
      
      <p>A risk has been detected in the system that requires your attention as the on-call guard:</p>
      
      <h3>
        <span class="risk-badge risk-${notification.risk_level}">
          ${notification.risk_level.toUpperCase()}
        </span>
        ${notification.entity_name}
      </h3>
      
      <p><strong>Type:</strong> ${notification.entity_type}</p>
      <p><strong>Failure probability:</strong> ${(notification.probability * 100).toFixed(1)}%</p>
      <p><strong>Attempt:</strong> ${notification.guard_attempts} of ${this.MAX_GUARD_ATTEMPTS}</p>
      
      ${
        metadata.baseline_comparison
          ? `
      <h4>📊 Baseline comparison:</h4>
      <ul>
        <li>Current error rate: ${(metadata.baseline_comparison.current_error_rate * 100).toFixed(2)}%</li>
        <li>Baseline error rate: ${(metadata.baseline_comparison.baseline_error_rate * 100).toFixed(2)}%</li>
        <li>Deviation: ${metadata.baseline_comparison.deviation_percentage.toFixed(1)}%</li>
      </ul>
      `
          : ''
      }
      
      ${
        metadata.trend
          ? `
      <h4>📈 Trend:</h4>
      <p>Direction: <strong>${metadata.trend.direction}</strong></p>
      `
          : ''
      }
      
      ${
        metadata.recommended_actions
          ? `
      <h4>💡 Recommended actions:</h4>
      <ul>
        ${metadata.recommended_actions.map((action: string) => `<li>${action}</li>`).join('')}
      </ul>
      `
          : ''
      }
      
      <div class="actions">
        <h4>⚡ Go to the application to decide what to do</h4>
        
        <p style="color: #f44336; font-weight: bold;">
          ⏰ If you don't respond within ${this.GUARD_NOTIFICATION_INTERVAL_MINUTES} minutes, another reminder will be sent.
          After ${this.MAX_GUARD_ATTEMPTS} attempts, it will be automatically escalated to the entire team.
        </p>
      </div>
    </div>
    
    <div class="footer">
      <p>This is an automated message from Yuno's Failure Prediction System.</p>
      <p>Attempt ${notification.guard_attempts} of ${this.MAX_GUARD_ATTEMPTS}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Construye el cuerpo del email escalado
   */
  private buildEscalatedEmailBody(notification: RiskNotification): string {
    const metadata = notification.metadata || {};

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #d32f2f; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background: #fff3e0; padding: 20px; border: 2px solid #d32f2f; }
    .alert-box { background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🚨 CRITICAL ALERT ESCALATED</h2>
    </div>
    
    <div class="content">
      <div class="alert-box">
        <h3>⚠️ IMMEDIATE ATTENTION REQUIRED</h3>
        <p>This alert was automatically escalated after ${notification.guard_attempts} unanswered on-call guard attempts.</p>
      </div>
      
      <h3>Entity at Risk: ${notification.entity_name}</h3>
      
      <p><strong>Type:</strong> ${notification.entity_type}</p>
      <p><strong>Risk Level:</strong> ${notification.risk_level.toUpperCase()}</p>
      <p><strong>Failure probability:</strong> ${(notification.probability * 100).toFixed(1)}%</p>
      
      ${
        metadata.recommended_actions
          ? `
      <h4>💡 Recommended actions:</h4>
      <ul>
        ${metadata.recommended_actions.map((action: string) => `<li>${action}</li>`).join('')}
      </ul>
      `
          : ''
      }
      
      <p style="margin-top: 20px;">
        ⚡ Go to the application to decide what to do
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Construye la explicación de la alerta
   */
  private buildAlertExplanation(entity: FailureProbability): string {
    return `
Failure probability: ${(entity.probability * 100).toFixed(1)}%
Current error rate: ${(entity.baseline_comparison.current_error_rate * 100).toFixed(2)}%
Baseline error rate: ${(entity.baseline_comparison.baseline_error_rate * 100).toFixed(2)}%
Trend: ${entity.trend.direction}

Recommended actions:
${entity.recommended_actions.join('\n')}
  `.trim();
  }

  /**
   * Mapea nivel de riesgo a severidad de alerta
   */
  private mapRiskToSeverity(riskLevel: string): AlertSeverity {
    switch (riskLevel) {
      case 'critical':
        return AlertSeverity.CRITICAL;
      case 'high':
        return AlertSeverity.WARNING;
      case 'medium':
        return AlertSeverity.WARNING;
      default:
        return AlertSeverity.INFO;
    }
  }

  private formatWhatsAppTo(phone?: string) {
    if (!phone) return null;

    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('whatsapp:')) return cleaned;
    if (cleaned.startsWith('+')) return `whatsapp:${cleaned}`;
    return `whatsapp:+${cleaned}`;
  }

  private buildEscalatedWhatsAppBody(notification: RiskNotification): string {
    const metadata = notification.metadata || {};

    const lines: string[] = [];

    lines.push('🚨 *CRITICAL ALERT ESCALATED*');
    lines.push('');
    lines.push('⚠️ *IMMEDIATE ATTENTION REQUIRED*');
    lines.push(
      `This alert was automatically escalated after ${notification.guard_attempts} unanswered on-call guard attempts.`,
    );
    lines.push('');

    lines.push(`*Entity at Risk:* ${notification.entity_name}`);
    lines.push(`*Type:* ${notification.entity_type}`);
    lines.push(
      `*Risk Level:* ${String(notification.risk_level).toUpperCase()}`,
    );
    lines.push(
      `*Failure probability:* ${(notification.probability * 100).toFixed(1)}%`,
    );

    if (metadata.recommended_actions?.length) {
      lines.push('');
      lines.push('💡 *Recommended actions:*');
      for (const action of metadata.recommended_actions as string[]) {
        lines.push(`• ${action}`);
      }
    }

    lines.push('');
    lines.push('⚡ Go to the application to decide what to do.');

    // WhatsApp has a ~1600 char limit (and your channel already truncates). Keep it safe:
    return lines.join('\n').slice(0, 1600);
  }

  private buildGuardWhatsAppBody(
    notification: RiskNotification,
    guardUser: User,
  ): string {
    const metadata = notification.metadata || {};

    const lines: string[] = [];
    lines.push('🚨 *RISK ALERT - Action required*');
    lines.push('');
    lines.push(`Hi *${guardUser.name}*,`);
    lines.push(
      'A risk has been detected that requires your attention as the on-call guard:',
    );
    lines.push('');

    lines.push(
      `*${String(notification.risk_level).toUpperCase()}* — ${notification.entity_name}`,
    );
    lines.push(`*Type:* ${notification.entity_type}`);
    lines.push(
      `*Failure probability:* ${(notification.probability * 100).toFixed(1)}%`,
    );
    lines.push(
      `*Attempt:* ${notification.guard_attempts} of ${this.MAX_GUARD_ATTEMPTS}`,
    );

    if (metadata.baseline_comparison) {
      lines.push('');
      lines.push('📊 *Baseline comparison:*');
      lines.push(
        `• Current error rate: ${(metadata.baseline_comparison.current_error_rate * 100).toFixed(2)}%`,
      );
      lines.push(
        `• Baseline error rate: ${(metadata.baseline_comparison.baseline_error_rate * 100).toFixed(2)}%`,
      );
      lines.push(
        `• Deviation: ${metadata.baseline_comparison.deviation_percentage.toFixed(1)}%`,
      );
    }

    if (metadata.trend) {
      lines.push('');
      lines.push('📈 *Trend:*');
      lines.push(`• Direction: *${metadata.trend.direction}*`);
    }

    if (metadata.recommended_actions?.length) {
      lines.push('');
      lines.push('💡 *Recommended actions:*');
      for (const action of metadata.recommended_actions as string[]) {
        lines.push(`• ${action}`);
      }
    }

    lines.push('');
    lines.push(
      `⏰ If you don't respond within ${this.GUARD_NOTIFICATION_INTERVAL_MINUTES} minutes, another reminder will be sent. After ${this.MAX_GUARD_ATTEMPTS} attempts, it will be escalated automatically.`,
    );

    return lines.join('\n').slice(0, 1600);
  }
}
