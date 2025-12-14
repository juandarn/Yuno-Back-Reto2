import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Metric } from './entities/metric.entity';
import { CreateMetricDto } from './dto/create-metric.dto';
import { AlertService } from '../alert/alert.service';
import { AlertSeverity } from '../alert/dto/create-alert.dto';

type DetectedAlert = {
  severity: AlertSeverity;
  title: string;
  explanation: string;
};

@Injectable()
export class MetricService {
  private readonly logger = new Logger(MetricService.name);

  // Umbrales para detección de anomalías
  private readonly ANOMALY_THRESHOLDS = {
    score_anomalia: 0.8,
    error_rate: 0.1, // 10%
    approval_rate_min: 0.7, // 70%
    p95_latency: 5000, // 5 segundos
  };

  constructor(
    @InjectRepository(Metric)
    private metricRepository: Repository<Metric>,
    private alertsService: AlertService,
  ) {}

  async create(createDto: CreateMetricDto): Promise<Metric> {
    const metric = this.metricRepository.create(createDto);
    const savedMetric = await this.metricRepository.save(metric);

    // Analizar la métrica para detectar anomalías
    await this.analyzeMetric(savedMetric);

    return savedMetric;
  }

  async findAll(): Promise<Metric[]> {
    return await this.metricRepository.find({
      order: { timestamptz: 'DESC' },
      take: 100, // Limitar a las últimas 100 métricas
    });
  }

  async findOne(id: string): Promise<Metric> {
    const metric = await this.metricRepository.findOne({ where: { id } });
    if (!metric) {
      throw new NotFoundException(`Metric with ID ${id} not found`);
    }
    return metric;
  }

  async findByType(type: string, limit: number = 50): Promise<Metric[]> {
    return await this.metricRepository.find({
      where: { type: type },
      order: { timestamptz: 'DESC' },
      take: limit,
    });
  }

  async findByMerchant(merchantId: string): Promise<Metric[]> {
    return await this.metricRepository.find({
      where: { merchant_id: merchantId },
      order: { timestamptz: 'DESC' },
      take: 100,
    });
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<Metric[]> {
    return await this.metricRepository.find({
      where: {
        timestamptz: Between(startDate, endDate),
      },
      order: { timestamptz: 'ASC' },
    });
  }

  async getAggregatedMetrics(
    type: string,
    merchantId?: string,
    hours: number = 24,
  ): Promise<any> {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    const query = this.metricRepository
      .createQueryBuilder('metric')
      .where('metric.tipo = :type', { type })
      .andWhere('metric.timestamptz >= :startDate', { startDate });

    if (merchantId) {
      query.andWhere('metric.merchant_id = :merchantId', { merchantId });
    }

    const metrics = await query.getMany();

    return {
      count: metrics.length,
      avgValue: this.calculateAverage(metrics.map((m) => m.value)),
      avgErrorRate: this.calculateAverage(metrics.map((m) => m.error_rate)),
      avgApprovalRate: this.calculateAverage(
        metrics.map((m) => m.approval_rate),
      ),
      avgLatency: this.calculateAverage(metrics.map((m) => m.p95_latency)),
      maxAnomalyScore: Math.max(...metrics.map((m) => m.score_anomalia || 0)),
      period: `${hours} hours`,
    };
  }

  async remove(id: string): Promise<void> {
    const metric = await this.findOne(id);
    await this.metricRepository.remove(metric);
  }
  private async analyzeMetric(metric: Metric): Promise<void> {
    const alerts: DetectedAlert[] = [];

    // Verificar score de anomalía
    if (
      metric.score_anomalia !== null &&
      metric.score_anomalia !== undefined &&
      metric.score_anomalia >= this.ANOMALY_THRESHOLDS.score_anomalia
    ) {
      alerts.push({
        severity: AlertSeverity.WARNING,
        title: 'Anomalía detectada en métrica',
        explanation: `Score de anomalía elevado: ${metric.score_anomalia}`,
      });
    }

    // Verificar tasa de error
    if (
      metric.error_rate !== null &&
      metric.error_rate !== undefined &&
      metric.error_rate >= this.ANOMALY_THRESHOLDS.error_rate
    ) {
      alerts.push({
        severity:
          metric.error_rate >= 0.2
            ? AlertSeverity.CRITICAL
            : AlertSeverity.WARNING,
        title: 'Tasa de error elevada',
        explanation: `Tasa de error: ${(metric.error_rate * 100).toFixed(2)}%`,
      });
    }

    // Verificar tasa de aprobación
    if (
      metric.approval_rate !== null &&
      metric.approval_rate !== undefined &&
      metric.approval_rate < this.ANOMALY_THRESHOLDS.approval_rate_min
    ) {
      alerts.push({
        severity:
          metric.approval_rate < 0.5
            ? AlertSeverity.CRITICAL
            : AlertSeverity.WARNING,
        title: 'Tasa de aprobación baja',
        explanation: `Tasa de aprobación: ${(metric.approval_rate * 100).toFixed(2)}%`,
      });
    }

    // Verificar latencia
    if (
      metric.p95_latency !== null &&
      metric.p95_latency !== undefined &&
      metric.p95_latency >= this.ANOMALY_THRESHOLDS.p95_latency
    ) {
      alerts.push({
        severity:
          metric.p95_latency >= 10000
            ? AlertSeverity.CRITICAL
            : AlertSeverity.WARNING,
        title: 'Latencia elevada',
        explanation: `P95 Latency: ${metric.p95_latency}ms`,
      });
    }

    // Crear alertas
    for (const alertData of alerts) {
      await this.alertsService.create({
        metric_id: metric.id,
        severity: alertData.severity,
        title: alertData.title,
        explanation: alertData.explanation,
        merchant_id: metric.merchant_id,
      });
    }

    if (alerts.length > 0) {
      this.logger.warn(
        `Created ${alerts.length} alerts for metric ${metric.id}`,
      );
    }
  }

  private calculateAverage(values: number[]): number {
    const validValues = values.filter((v) => v !== null && v !== undefined);
    if (validValues.length === 0) return 0;
    return validValues.reduce((a, b) => a + b, 0) / validValues.length;
  }
}
