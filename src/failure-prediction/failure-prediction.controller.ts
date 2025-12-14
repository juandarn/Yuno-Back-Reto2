import {
  Controller,
  Get,
  Query,
  Post,
  Body,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { FailurePredictionService } from './failure-prediction.service';
import {
  QueryPredictionDto,
  PredictionConfigDto,
  PredictionSummary,
  TopRiskyEntity,
  Top3Summary,
} from './dto/failure-prediction.dto';

@Controller('failure-prediction')
export class FailurePredictionController {
  constructor(private readonly predictionService: FailurePredictionService) {}

  /**
   * Obtener predicciones de probabilidad de caída
   *
   * Ejemplos de uso:
   * - GET /failure-prediction?entity_type=merchant
   * - GET /failure-prediction?entity_type=provider&include_low_risk=true
   * - GET /failure-prediction?merchant_id=xxx&entity_type=route
   * - GET /failure-prediction?provider_id=xxx&time_window_minutes=120
   */
  @Get()
  @UsePipes(new ValidationPipe({ transform: true }))
  async getPredictions(
    @Query() query: QueryPredictionDto,
  ): Promise<PredictionSummary> {
    return await this.predictionService.getPredictions(query);
  }

  /**
   * Obtener predicciones con configuración personalizada
   *
   * Permite ajustar pesos de señales y umbrales
   */
  @Post()
  async getPredictionsWithConfig(
    @Body('query') query: QueryPredictionDto,
    @Body('config') config: PredictionConfigDto,
  ): Promise<PredictionSummary> {
    return await this.predictionService.getPredictions(query, config);
  }

  /**
   * Endpoint simplificado para el frontend - merchants en riesgo
   */
  @Get('merchants/at-risk')
  async getMerchantsAtRisk(): Promise<PredictionSummary> {
    return await this.predictionService.getPredictions({
      entity_type: 'merchant',
      time_window_minutes: 60,
      include_low_risk: false,
    });
  }

  /**
   * Endpoint simplificado para el frontend - providers en riesgo
   */
  @Get('providers/at-risk')
  async getProvidersAtRisk(): Promise<PredictionSummary> {
    return await this.predictionService.getPredictions({
      entity_type: 'provider',
      time_window_minutes: 60,
      include_low_risk: false,
    });
  }

  /**
   * Dashboard completo con todas las predicciones
   */
  @Get('dashboard')
  async getDashboard(): Promise<{
    merchants: PredictionSummary;
    providers: PredictionSummary;
    methods: PredictionSummary;
    global_health: number;
  }> {
    const merchants = await this.predictionService.getPredictions({
      entity_type: 'merchant',
      time_window_minutes: 60,
      include_low_risk: false,
    });

    const providers = await this.predictionService.getPredictions({
      entity_type: 'provider',
      time_window_minutes: 60,
      include_low_risk: false,
    });

    const methods = await this.predictionService.getPredictions({
      entity_type: 'method',
      time_window_minutes: 60,
      include_low_risk: false,
    });

    // Score global es el promedio ponderado
    const global_health = Math.round(
      merchants.global_health_score * 0.4 +
        providers.global_health_score * 0.4 +
        methods.global_health_score * 0.2,
    );

    return {
      merchants,
      providers,
      methods,
      global_health,
    };
  }

  /**
   * Obtener Top 3 de Merchants con mayor probabilidad de caída
   * GET /failure-prediction/top3/merchants
   */
  @Get('top3/merchants')
  async getTop3Merchants(
    @Query('time_window_minutes') timeWindow?: number,
  ): Promise<TopRiskyEntity[]> {
    return await this.predictionService.getTop3ByEntityType('merchant', {
      time_window_minutes: timeWindow,
    });
  }

  /**
   * Obtener Top 3 de Providers con mayor probabilidad de caída
   * GET /failure-prediction/top3/providers
   */
  @Get('top3/providers')
  async getTop3Providers(
    @Query('time_window_minutes') timeWindow?: number,
  ): Promise<TopRiskyEntity[]> {
    return await this.predictionService.getTop3ByEntityType('provider', {
      time_window_minutes: timeWindow,
    });
  }

  /**
   * Obtener Top 3 de Payment Methods con mayor probabilidad de caída
   * GET /failure-prediction/top3/methods
   */
  @Get('top3/methods')
  async getTop3Methods(
    @Query('time_window_minutes') timeWindow?: number,
  ): Promise<TopRiskyEntity[]> {
    return await this.predictionService.getTop3ByEntityType('method', {
      time_window_minutes: timeWindow,
    });
  }

  /**
   * Obtener Top 3 general (todas las entidades combinadas)
   * GET /failure-prediction/top3/overall
   */
  @Get('top3/overall')
  async getTop3Overall(
    @Query('time_window_minutes') timeWindow?: number,
  ): Promise<TopRiskyEntity[]> {
    return await this.predictionService.getOverallTop3({
      time_window_minutes: timeWindow,
    });
  }

  /**
   * Obtener Top 3 completo (todas las categorías)
   * GET /failure-prediction/top3
   */
  @Get('top3')
  async getTop3Summary(
    @Query('time_window_minutes') timeWindow?: number,
  ): Promise<Top3Summary> {
    return await this.predictionService.getTop3Summary({
      time_window_minutes: timeWindow,
    });
  }
}