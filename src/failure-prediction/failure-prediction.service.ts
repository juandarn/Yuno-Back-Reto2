import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transaction/entities/transaction.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Provider } from '../provider/entities/provider.entity';
import { PaymentMethod } from '../payment-method/entities/payment-method.entity';
import { Country } from '../country/entities/country.entity';
import { AlertService } from '../alert/alert.service';
import { AlertSeverity } from '../alert/dto/create-alert.dto';
import {
  FailureProbability,
  PredictionSummary,
  QueryPredictionDto,
  PredictionConfigDto,
  Signal,
  RiskLevel,
  Top3Summary,
  TopRiskyEntity,
} from './dto/failure-prediction.dto';

interface EntityMetrics {
  error_rate: number;
  approval_rate: number;
  p95_latency: number;
  sample_size: number;
  recent_error_rate: number; // última hora
  baseline_error_rate: number; // última semana (7 días)
}

@Injectable()
export class FailurePredictionService {
  private readonly logger = new Logger(FailurePredictionService.name);

  // Configuración por defecto
  private defaultConfig: Required<PredictionConfigDto> = {
    weights: {
      error_rate: 0.35,
      latency: 0.25,
      approval_rate: 0.25,
      trend: 0.15,
    },
    thresholds: {
      critical: 0.75,
      high: 0.5,
      medium: 0.25,
    },
    normalization: {
      max_error_rate: 0.5,
      max_latency: 10000,
      min_approval_rate: 0.3,
    },
  };

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Merchant)
    private merchantRepository: Repository<Merchant>,
    @InjectRepository(Provider)
    private providerRepository: Repository<Provider>,
    @InjectRepository(PaymentMethod)
    private paymentMethodRepository: Repository<PaymentMethod>,
    @InjectRepository(Country)
    private countryRepository: Repository<Country>,
    private alertService: AlertService,
  ) {}

  async getPredictions(
    query: QueryPredictionDto,
    config?: PredictionConfigDto,
  ): Promise<PredictionSummary> {
    const effectiveConfig = this.mergeConfig(config);
    const timeWindowMinutes = query.time_window_minutes || 60;
    const baselineWindowHours = query.baseline_window_hours || 168; // 7 días
    const minSampleSize = query.min_sample_size || 1;

    const now = new Date();
    const recentStart = new Date(now.getTime() - timeWindowMinutes * 60 * 1000);
    const baselineStart = new Date(
      now.getTime() - baselineWindowHours * 60 * 60 * 1000,
    );

    // Obtener transacciones para ambas ventanas
    const recentTransactions = await this.getFilteredTransactions(
      query,
      recentStart,
    );
    const baselineTransactions = await this.getFilteredTransactions(
      query,
      baselineStart,
    );

    const predictions: FailureProbability[] = [];

    // Determinar qué entidades analizar
    const entityType = query.entity_type || 'route';

    if (
      entityType === 'merchant' ||
      entityType === 'provider' ||
      entityType === 'method' ||
      entityType === 'country'
    ) {
      const entityPredictions = await this.analyzeEntities(
        entityType,
        recentTransactions,
        baselineTransactions,
        effectiveConfig,
        minSampleSize,
      );
      predictions.push(...entityPredictions);
    } else {
      // Analizar rutas completas
      const routePredictions = await this.analyzeRoutes(
        recentTransactions,
        baselineTransactions,
        effectiveConfig,
        minSampleSize,
      );
      predictions.push(...routePredictions);
    }

    // Filtrar por nivel de riesgo si se solicita
    const filteredPredictions = query.include_low_risk
      ? predictions
      : predictions.filter((p) => p.risk_level !== RiskLevel.LOW);

    // Ordenar por probabilidad descendente
    filteredPredictions.sort((a, b) => b.probability - a.probability);

    // Generar alertas automáticas para riesgos altos
    await this.generateAutoAlerts(filteredPredictions);

    // Calcular resumen
    const summary = this.calculateSummary(filteredPredictions);

    return summary;
  }

  private async analyzeEntities(
    entityType: 'merchant' | 'provider' | 'method' | 'country',
    recentTransactions: Transaction[],
    baselineTransactions: Transaction[],
    config: Required<PredictionConfigDto>,
    minSampleSize: number,
  ): Promise<FailureProbability[]> {
    const predictions: FailureProbability[] = [];

    // Agrupar transacciones por entidad
    const entityGroups = this.groupByEntity(recentTransactions, entityType);
    const baselineGroups = this.groupByEntity(baselineTransactions, entityType);

    this.logger.debug(
      `Analyzing ${entityGroups.size} ${entityType} entities. Recent txs: ${recentTransactions.length}, Baseline txs: ${baselineTransactions.length}, Min sample size: ${minSampleSize}`,
    );

    // Obtener nombres de entidades
    const entityNames = await this.getEntityNames(
      entityType,
      Array.from(entityGroups.keys()),
    );

    let skippedCount = 0;
    for (const [entityId, transactions] of entityGroups.entries()) {
      if (transactions.length < minSampleSize) {
        skippedCount++;
        this.logger.debug(
          `Skipping ${entityType} ${entityId} - insufficient samples: ${transactions.length} < ${minSampleSize}`,
        );
        continue;
      }

      const baselineTxs = baselineGroups.get(entityId) || [];
      const metrics = this.calculateMetrics(transactions, baselineTxs);

      const prediction = this.calculateFailureProbability(
        entityType,
        entityId,
        entityNames.get(entityId) || 'Unknown',
        metrics,
        config,
      );

      predictions.push(prediction);
    }

    if (skippedCount > 0) {
      this.logger.warn(
        `Skipped ${skippedCount} ${entityType} entities due to insufficient sample size`,
      );
    }

    return predictions;
  }

  private async analyzeRoutes(
    recentTransactions: Transaction[],
    baselineTransactions: Transaction[],
    config: Required<PredictionConfigDto>,
    minSampleSize: number,
  ): Promise<FailureProbability[]> {
    const predictions: FailureProbability[] = [];

    // Agrupar por ruta completa
    const routeGroups = new Map<string, Transaction[]>();
    const baselineRouteGroups = new Map<string, Transaction[]>();

    for (const tx of recentTransactions) {
      const routeKey = this.getRouteKey(tx);
      if (!routeGroups.has(routeKey)) {
        routeGroups.set(routeKey, []);
      }
      routeGroups.get(routeKey)!.push(tx);
    }

    for (const tx of baselineTransactions) {
      const routeKey = this.getRouteKey(tx);
      if (!baselineRouteGroups.has(routeKey)) {
        baselineRouteGroups.set(routeKey, []);
      }
      baselineRouteGroups.get(routeKey)!.push(tx);
    }

    // Obtener nombres de entidades
    const allTransactions = [...recentTransactions];
    const merchantIds = [...new Set(allTransactions.map((t) => t.merchant_id))];
    const providerIds = [...new Set(allTransactions.map((t) => t.provider_id))];
    const methodIds = [...new Set(allTransactions.map((t) => t.method_id))];

    const merchants = await this.merchantRepository.findByIds(merchantIds);
    const providers = await this.providerRepository.findByIds(providerIds);
    const methods = await this.paymentMethodRepository.findByIds(methodIds);

    const merchantNames = new Map(merchants.map((m) => [m.id, m.name]));
    const providerNames = new Map(providers.map((p) => [p.id, p.name]));
    const methodNames = new Map(methods.map((m) => [m.id, m.name]));

    for (const [routeKey, transactions] of routeGroups.entries()) {
      if (transactions.length < minSampleSize) {
        continue;
      }

      const baselineTxs = baselineRouteGroups.get(routeKey) || [];
      const metrics = this.calculateMetrics(transactions, baselineTxs);

      const [merchantId, providerId, methodId, countryCode] =
        routeKey.split('|');
      const routeName = `${merchantNames.get(merchantId) || 'Unknown'} → ${providerNames.get(providerId) || 'Unknown'} → ${methodNames.get(methodId) || 'Unknown'} (${countryCode})`;

      const prediction = this.calculateFailureProbability(
        'route',
        routeKey,
        routeName,
        metrics,
        config,
      );

      predictions.push(prediction);
    }

    return predictions;
  }

  private calculateFailureProbability(
    entityType: string,
    entityId: string,
    entityName: string,
    metrics: EntityMetrics,
    config: Required<PredictionConfigDto>,
  ): FailureProbability {
    // Calcular señales normalizadas
    const signals: Signal[] = [];

    // 1. Señal de tasa de error (normalizada)
    const errorSignal: Signal = {
      name: 'error_rate',
      value: metrics.error_rate,
      normalized_value: Math.min(
        metrics.error_rate / config.normalization.max_error_rate,
        1,
      ),
      weight: config.weights.error_rate,
      contribution: 0,
    };
    errorSignal.contribution =
      errorSignal.normalized_value * errorSignal.weight;
    signals.push(errorSignal);

    // 2. Señal de latencia (normalizada)
    const latencySignal: Signal = {
      name: 'latency',
      value: metrics.p95_latency,
      normalized_value: Math.min(
        metrics.p95_latency / config.normalization.max_latency,
        1,
      ),
      weight: config.weights.latency,
      contribution: 0,
    };
    latencySignal.contribution =
      latencySignal.normalized_value * latencySignal.weight;
    signals.push(latencySignal);

    // 3. Señal de tasa de aprobación (invertida y normalizada)
    const approvalGap = Math.max(
      config.normalization.min_approval_rate - metrics.approval_rate,
      0,
    );
    const approvalSignal: Signal = {
      name: 'approval_rate',
      value: metrics.approval_rate,
      normalized_value:
        approvalGap / (1 - config.normalization.min_approval_rate),
      weight: config.weights.approval_rate,
      contribution: 0,
    };
    approvalSignal.contribution =
      approvalSignal.normalized_value * approvalSignal.weight;
    signals.push(approvalSignal);

    // 4. Señal de tendencia (comparación contra baseline)
    const errorTrend = metrics.recent_error_rate - metrics.baseline_error_rate;
    const trendDirection =
      errorTrend > 0.05
        ? 'degrading'
        : errorTrend < -0.05
          ? 'improving'
          : 'stable';
    const trendSignal: Signal = {
      name: 'trend',
      value: errorTrend,
      normalized_value: Math.max(
        0,
        Math.min(errorTrend / config.normalization.max_error_rate, 1),
      ),
      weight: config.weights.trend,
      contribution: 0,
    };
    trendSignal.contribution =
      trendSignal.normalized_value * trendSignal.weight;
    signals.push(trendSignal);

    // Calcular probabilidad final (función logística)
    const rawScore = signals.reduce((sum, s) => sum + s.contribution, 0);
    // Aplicar función logística para suavizar: P = 1 / (1 + e^(-k*(x - 0.5)))
    const k = 10; // factor de pendiente
    const probability = 1 / (1 + Math.exp(-k * (rawScore - 0.5)));

    // Determinar nivel de riesgo
    let riskLevel: RiskLevel;
    if (probability >= config.thresholds.critical) {
      riskLevel = RiskLevel.CRITICAL;
    } else if (probability >= config.thresholds.high) {
      riskLevel = RiskLevel.HIGH;
    } else if (probability >= config.thresholds.medium) {
      riskLevel = RiskLevel.MEDIUM;
    } else {
      riskLevel = RiskLevel.LOW;
    }

    // Calcular confianza basada en tamaño de muestra
    const confidence = Math.min(metrics.sample_size / 100, 1);

    // Generar recomendaciones
    const recommendations = this.generateRecommendations(
      signals,
      riskLevel,
      entityType,
    );

    // Calcular tasa de cambio (cambio por hora)
    const rateOfChange = errorTrend * (60 / 60); // normalizado a por hora

    return {
      entity_type: entityType as any,
      entity_id: entityId,
      entity_name: entityName,
      probability,
      risk_level: riskLevel,
      signals,
      confidence,
      sample_size: metrics.sample_size,
      baseline_comparison: {
        current_error_rate: metrics.recent_error_rate,
        baseline_error_rate: metrics.baseline_error_rate,
        deviation_percentage:
          metrics.baseline_error_rate > 0
            ? (errorTrend / metrics.baseline_error_rate) * 100
            : 0,
      },
      trend: {
        direction: trendDirection,
        rate_of_change: rateOfChange,
      },
      recommended_actions: recommendations,
      timestamp: new Date(),
    };
  }

  private calculateMetrics(
    recentTransactions: Transaction[],
    baselineTransactions: Transaction[],
  ): EntityMetrics {
    const recentApproved = recentTransactions.filter(
      (t) => t.status === 'approved',
    ).length;
    const recentErrors = recentTransactions.filter(
      (t) => t.status === 'error' || t.status === 'timeout',
    ).length;
    const recentTotal = recentTransactions.length;

    const baselineApproved = baselineTransactions.filter(
      (t) => t.status === 'approved',
    ).length;
    const baselineErrors = baselineTransactions.filter(
      (t) => t.status === 'error' || t.status === 'timeout',
    ).length;
    const baselineTotal = baselineTransactions.length;

    const error_rate = recentTotal > 0 ? recentErrors / recentTotal : 0;
    const approval_rate = recentTotal > 0 ? recentApproved / recentTotal : 0;

    const latencies = recentTransactions
      .map((t) => t.latency_ms || 0)
      .sort((a, b) => a - b);
    const p95_index = Math.ceil(0.95 * latencies.length) - 1;
    const p95_latency = latencies[Math.max(0, p95_index)] || 0;

    const baseline_error_rate =
      baselineTotal > 0 ? baselineErrors / baselineTotal : 0;

    return {
      error_rate,
      approval_rate,
      p95_latency,
      sample_size: recentTotal,
      recent_error_rate: error_rate,
      baseline_error_rate,
    };
  }

  private generateRecommendations(
    signals: Signal[],
    riskLevel: RiskLevel,
    entityType: string,
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === RiskLevel.CRITICAL || riskLevel === RiskLevel.HIGH) {
      // Identificar la señal más problemática
      const maxContribution = Math.max(...signals.map((s) => s.contribution));
      const criticalSignal = signals.find(
        (s) => s.contribution === maxContribution,
      );

      if (criticalSignal) {
        switch (criticalSignal.name) {
          case 'error_rate':
            recommendations.push(
              'Revisar logs de errores para identificar patrón de fallos',
            );
            recommendations.push(
              'Verificar conectividad con el proveedor de pagos',
            );
            if (entityType === 'provider') {
              recommendations.push('Considerar activar provider de respaldo');
            }
            break;
          case 'latency':
            recommendations.push('Investigar degradación de performance');
            recommendations.push('Revisar configuración de timeouts');
            recommendations.push('Verificar carga del sistema');
            break;
          case 'approval_rate':
            recommendations.push(
              'Analizar razones de rechazo de transacciones',
            );
            recommendations.push('Revisar configuración de reglas de negocio');
            if (entityType === 'method') {
              recommendations.push(
                'Evaluar método de pago alternativo para este segmento',
              );
            }
            break;
          case 'trend':
            recommendations.push(
              'Monitorear de cerca - tendencia de degradación detectada',
            );
            recommendations.push('Preparar plan de contingencia');
            break;
        }
      }

      if (riskLevel === RiskLevel.CRITICAL) {
        recommendations.unshift('🚨 ACCIÓN INMEDIATA REQUERIDA');
        if (entityType === 'provider') {
          recommendations.push('Considerar failover automático');
        }
      }
    } else if (riskLevel === RiskLevel.MEDIUM) {
      recommendations.push('Mantener bajo observación');
      recommendations.push('Incrementar frecuencia de monitoreo');
    }

    return recommendations;
  }

  private calculateSummary(
    predictions: FailureProbability[],
  ): PredictionSummary {
    const criticalCount = predictions.filter(
      (p) => p.risk_level === RiskLevel.CRITICAL,
    ).length;
    const highCount = predictions.filter(
      (p) => p.risk_level === RiskLevel.HIGH,
    ).length;
    const mediumCount = predictions.filter(
      (p) => p.risk_level === RiskLevel.MEDIUM,
    ).length;
    const lowCount = predictions.filter(
      (p) => p.risk_level === RiskLevel.LOW,
    ).length;

    // Calcular score de salud global (100 = perfecto, 0 = todo mal)
    const avgProbability =
      predictions.length > 0
        ? predictions.reduce((sum, p) => sum + p.probability, 0) /
          predictions.length
        : 0;
    const global_health_score = Math.round((1 - avgProbability) * 100);

    return {
      total_entities_analyzed: predictions.length,
      high_risk_count: criticalCount + highCount,
      medium_risk_count: mediumCount,
      low_risk_count: lowCount,
      predictions,
      global_health_score,
      timestamp: new Date(),
    };
  }

  private async generateAutoAlerts(
    predictions: FailureProbability[],
  ): Promise<void> {
    const highRiskPredictions = predictions.filter(
      (p) =>
        p.risk_level === RiskLevel.CRITICAL || p.risk_level === RiskLevel.HIGH,
    );

    for (const prediction of highRiskPredictions) {
      const severity =
        prediction.risk_level === RiskLevel.CRITICAL
          ? AlertSeverity.CRITICAL
          : AlertSeverity.WARNING;

      const merchantId =
        prediction.entity_type === 'merchant'
          ? prediction.entity_id
          : prediction.entity_type === 'route'
            ? prediction.entity_id.split('|')[0]
            : undefined;

      await this.alertService.create({
        severity: severity,
        title: `Riesgo ${prediction.risk_level.toUpperCase()} de caída detectado`,
        explanation: `${prediction.entity_type}: ${prediction.entity_name}
Probabilidad de fallo: ${(prediction.probability * 100).toFixed(1)}%
Tasa de error actual: ${(prediction.baseline_comparison.current_error_rate * 100).toFixed(1)}%
Tendencia: ${prediction.trend.direction}

Acciones recomendadas:
${prediction.recommended_actions.join('\n')}`,
        merchant_id: merchantId,
      });
    }

    if (highRiskPredictions.length > 0) {
      this.logger.warn(
        `Generated ${highRiskPredictions.length} auto-alerts for high-risk predictions`,
      );
    }
  }

  private groupByEntity(
    transactions: Transaction[],
    entityType: 'merchant' | 'provider' | 'method' | 'country',
  ): Map<string, Transaction[]> {
    const groups = new Map<string, Transaction[]>();

    for (const tx of transactions) {
      let key: string;
      switch (entityType) {
        case 'merchant':
          key = tx.merchant_id;
          break;
        case 'provider':
          key = tx.provider_id;
          break;
        case 'method':
          key = tx.method_id;
          break;
        case 'country':
          key = tx.country_code;
          break;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(tx);
    }

    return groups;
  }

  private async getEntityNames(
    entityType: 'merchant' | 'provider' | 'method' | 'country',
    entityIds: string[],
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();

    switch (entityType) {
      case 'merchant': {
        const entities = await this.merchantRepository.findByIds(entityIds);
        entities.forEach((e) => names.set(e.id, e.name));
        break;
      }
      case 'provider': {
        const entities = await this.providerRepository.findByIds(entityIds);
        entities.forEach((e) => names.set(e.id, e.name));
        break;
      }
      case 'method': {
        const entities =
          await this.paymentMethodRepository.findByIds(entityIds);
        entities.forEach((e) => names.set(e.id, e.name));
        break;
      }
      case 'country': {
        const entities = await this.countryRepository.find({
          where: entityIds.map((code) => ({ code })),
        });
        entities.forEach((e) => names.set(e.code, e.name));
        break;
      }
    }

    return names;
  }

  private async getFilteredTransactions(
    query: QueryPredictionDto,
    startTime: Date,
  ): Promise<Transaction[]> {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('t')
      .where('t.date >= :startTime', { startTime });

    if (query.merchant_id) {
      queryBuilder.andWhere('t.merchant_id = :merchant_id', {
        merchant_id: query.merchant_id,
      });
    }
    if (query.provider_id) {
      queryBuilder.andWhere('t.provider_id = :provider_id', {
        provider_id: query.provider_id,
      });
    }
    if (query.method_id) {
      queryBuilder.andWhere('t.method_id = :method_id', {
        method_id: query.method_id,
      });
    }
    if (query.country_code) {
      queryBuilder.andWhere('t.country_code = :country_code', {
        country_code: query.country_code,
      });
    }

    return await queryBuilder.getMany();
  }

  private getRouteKey(tx: Transaction): string {
    return `${tx.merchant_id}|${tx.provider_id}|${tx.method_id}|${tx.country_code}`;
  }

  private mergeConfig(
    config?: PredictionConfigDto,
  ): Required<PredictionConfigDto> {
    if (!config) {
      return this.defaultConfig;
    }

    return {
      weights: { ...this.defaultConfig.weights, ...config.weights },
      thresholds: { ...this.defaultConfig.thresholds, ...config.thresholds },
      normalization: {
        ...this.defaultConfig.normalization,
        ...config.normalization,
      },
    };
  }

  /**
   * Obtiene el Top 3 de entidades con mayor probabilidad de caída
   */
  async getTop3ByEntityType(
    entityType: 'merchant' | 'provider' | 'method',
    query?: Partial<QueryPredictionDto>,
  ): Promise<TopRiskyEntity[]> {
    const predictions = await this.getPredictions({
      entity_type: entityType,
      time_window_minutes: query?.time_window_minutes || 60,
      baseline_window_hours: query?.baseline_window_hours || 168, // 7 días
      min_sample_size: query?.min_sample_size || 1,
      include_low_risk: false,
    });

    // Ordenar por probabilidad descendente y tomar top 3
    const top3Predictions = predictions.predictions
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3);

    // Mapear a formato TopRiskyEntity
    return top3Predictions.map((pred, index) => this.mapToTopRiskyEntity(pred, index + 1));
  }

  /**
   * Obtiene el Top 3 general (todas las entidades combinadas)
   */
  async getOverallTop3(
    query?: Partial<QueryPredictionDto>,
  ): Promise<TopRiskyEntity[]> {
    // Obtener predicciones de todas las entidades
    const [merchantPredictions, providerPredictions, methodPredictions] = await Promise.all([
      this.getPredictions({
        entity_type: 'merchant',
        time_window_minutes: query?.time_window_minutes || 60,
        baseline_window_hours: query?.baseline_window_hours || 168, // 7 días
        min_sample_size: query?.min_sample_size || 1,
        include_low_risk: false,
      }),
      this.getPredictions({
        entity_type: 'provider',
        time_window_minutes: query?.time_window_minutes || 60,
        baseline_window_hours: query?.baseline_window_hours || 168, // 7 días
        min_sample_size: query?.min_sample_size || 1,
        include_low_risk: false,
      }),
      this.getPredictions({
        entity_type: 'method',
        time_window_minutes: query?.time_window_minutes || 60,
        baseline_window_hours: query?.baseline_window_hours || 168, // 7 días
        min_sample_size: query?.min_sample_size || 1,
        include_low_risk: false,
      }),
    ]);

    // Combinar todas las predicciones
    const allPredictions = [
      ...merchantPredictions.predictions,
      ...providerPredictions.predictions,
      ...methodPredictions.predictions,
    ];

    // Ordenar por probabilidad descendente y tomar top 3
    const top3Predictions = allPredictions
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3);

    return top3Predictions.map((pred, index) => this.mapToTopRiskyEntity(pred, index + 1));
  }

  /**
   * Obtiene el Top 3 completo (por categoría y general)
   */
  async getTop3Summary(
    query?: Partial<QueryPredictionDto>,
  ): Promise<Top3Summary> {
    const [topMerchants, topProviders, topMethods, overallTop3] = await Promise.all([
      this.getTop3ByEntityType('merchant', query),
      this.getTop3ByEntityType('provider', query),
      this.getTop3ByEntityType('method', query),
      this.getOverallTop3(query),
    ]);

    return {
      top_merchants: topMerchants,
      top_providers: topProviders,
      top_methods: topMethods,
      overall_top_3: overallTop3,
      timestamp: new Date(),
    };
  }

  /**
   * Mapea una predicción a formato TopRiskyEntity
   */
  private mapToTopRiskyEntity(
    prediction: FailureProbability,
    rank: number,
  ): TopRiskyEntity {
    // Extraer métricas de las señales
    const errorRateSignal = prediction.signals.find(s => s.name === 'error_rate');
    const approvalRateSignal = prediction.signals.find(s => s.name === 'approval_rate');
    const latencySignal = prediction.signals.find(s => s.name === 'latency');

    return {
      rank,
      entity_type: prediction.entity_type,
      entity_id: prediction.entity_id,
      entity_name: prediction.entity_name,
      probability: prediction.probability,
      risk_level: prediction.risk_level,
      error_rate: errorRateSignal?.value || 0,
      approval_rate: approvalRateSignal?.value || 0,
      latency: latencySignal?.value || 0,
      trend: prediction.trend.direction,
      sample_size: prediction.sample_size,
      timestamp: prediction.timestamp,
    };
  }
}