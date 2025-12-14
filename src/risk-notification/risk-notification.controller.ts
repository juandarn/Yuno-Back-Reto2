import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { RiskNotificationService } from './risk-notification.service';
import { RiskNotification } from './entities/risk-notification.entity';

export class DismissRiskDto {
  user_id: string;
  reason: string;
}

@Controller('risk-notifications')
export class RiskNotificationController {
  constructor(
    private readonly riskNotificationService: RiskNotificationService,
  ) {}

  /**
   * Obtener todas las notificaciones de riesgo activas
   */
  @Get()
  async getAll(@Query('status') status?: string) {
    // TODO: Implementar query con filtros
    return { message: 'List of risk notifications' };
  }

  /**
   * Obtener notificaciones pendientes para el guardia
   */
  @Get('pending')
  async getPending() {
    // TODO: Implementar
    return { message: 'Pending guard notifications' };
  }

  /**
   * Descartar una notificación (acción del guardia)
   * POST /risk-notifications/:id/dismiss
   */
  @Post(':id/dismiss')
  async dismiss(
    @Param('id') id: string,
    @Body() dismissDto: DismissRiskDto,
  ): Promise<RiskNotification> {
    return await this.riskNotificationService.dismissRiskNotification(
      id,
      dismissDto.user_id,
      dismissDto.reason,
    );
  }

  /**
   * Propagar/escalar una notificación a todo el equipo (acción del guardia)
   * POST /risk-notifications/:id/propagate
   */
  @Post(':id/propagate')
  async propagate(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.riskNotificationService.propagateRiskNotification(id);
    return { success: true };
  }

  /**
   * Marcar como resuelta
   * POST /risk-notifications/:id/resolve
   */
  @Post(':id/resolve')
  async resolve(@Param('id') id: string): Promise<RiskNotification> {
    return await this.riskNotificationService.markAsResolved(id);
  }

  /**
   * Trigger manual de revisión de riesgos (para testing)
   * POST /risk-notifications/check-now
   */
  @Post('check-now')
  async checkNow(): Promise<{ message: string }> {
    await this.riskNotificationService.checkAndNotifyRisks();
    return { message: 'Risk check triggered successfully' };
  }
}
