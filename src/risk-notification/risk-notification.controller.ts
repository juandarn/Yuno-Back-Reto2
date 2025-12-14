import { Controller, Get, Post, Param, Body, Query, Res } from '@nestjs/common';
import { RiskNotificationService } from './risk-notification.service';
import { RiskNotification } from './entities/risk-notification.entity';
import type { Response } from 'express';

export class DismissRiskDto {
  user_id: string;
  reason: string;
}

@Controller('risk-notifications')
export class RiskNotificationController {
  constructor(
    private readonly riskNotificationService: RiskNotificationService,
  ) { }

  /**
   * Obtener todas las notificaciones de riesgo activas
   */
  @Get()
  async getAll(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(200, Math.max(1, Number(limit) || 20));

    return this.riskNotificationService.listMinimal(status, p, l);
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
  async propagate(
    @Param('id') id: string,
  ): Promise<{ success: boolean; entity_name?: string }> {
    const result = await this.riskNotificationService.propagateRiskNotification(id);
    return { success: true, entity_name: result.entity_name };
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

  // =========================================================
  // ✅ WRAPPERS GET PARA BOTONES EN EMAIL (NO ROMPEN NADA)
  // =========================================================

  /**
   * Propagar desde email (GET)
   * Usado por <a href="..."> en correos
   */
  @Get(':id/propagate')
  async propagateFromEmail(@Param('id') id: string, @Res() res: Response) {
    await this.riskNotificationService.propagateRiskNotification(id);

    return res
      .status(200)
      .send(
        '<h3>✅ Escalado enviado a todo el equipo. Puedes cerrar esta pestaña.</h3>',
      );
  }

  /**
   * Descartar desde email (GET)
   * Usado por <a href="..."> en correos
   */
  @Get(':id/dismiss')
  async dismissFromEmail(
    @Param('id') id: string,
    @Query('user_id') userId: string,
    @Query('reason') reason: string,
    @Res() res: Response,
  ) {
    await this.riskNotificationService.dismissRiskNotification(
      id,
      userId || 'email-action',
      reason || 'Dismissed from email button',
    );

    return res
      .status(200)
      .send('<h3>✅ Notificación descartada. Puedes cerrar esta pestaña.</h3>');
  }
}
