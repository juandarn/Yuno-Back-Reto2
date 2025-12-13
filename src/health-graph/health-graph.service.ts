import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Metric } from '../metric/entities/metric.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Provider } from '../provider/entities/provider.entity';
import { PaymentMethod } from '../payment-method/entities/payment-method.entity';
import { Country } from '../country/entities/country.entity';
import {
  HealthGraphResponse,
  PaymentRoute,
  GraphNode,
  GraphEdge,
  NodeStatus,
  EdgeStatus,
  QueryHealthGraphDto,
} from './dto/health-graph.dto';

interface RouteKey {
  merchant_id: string;
  provider_id: string;
  method_id: string;
  country_code: string;
}

interface RouteMetrics {
  approval_rate: number;
  error_rate: number;
  p95_latency: number;
  sample_size: number;
  merchant_name: string;
  provider_name: string;
  method_name: string;
  country_name: string;
}

@Injectable()
export class HealthGraphService {
  constructor(
    @InjectRepository(Metric)
    private metricRepository: Repository<Metric>,
    @InjectRepository(Merchant)
    private merchantRepository: Repository<Merchant>,
    @InjectRepository(Provider)
    private providerRepository: Repository<Provider>,
    @InjectRepository(PaymentMethod)
    private paymentMethodRepository: Repository<PaymentMethod>,
    @InjectRepository(Country)
    private countryRepository: Repository<Country>,
    private dataSource: DataSource,
  ) {}

  async getHealthGraph(
    query: QueryHealthGraphDto,
  ): Promise<HealthGraphResponse> {
    const timeWindowMinutes = query.time_window_minutes || 60;
    const criticalErrorRate = query.critical_error_rate || 0.3;
    const warningErrorRate = query.warning_error_rate || 0.15;
    const criticalApprovalRate = query.critical_approval_rate || 0.5;
    const warningApprovalRate = query.warning_approval_rate || 0.7;

    const startTime = new Date();
    startTime.setMinutes(startTime.getMinutes() - timeWindowMinutes);

    const { routeMetrics, transactions } = await this.getRouteMetrics(
      startTime,
      query,
    );

    const routes = await this.buildPaymentRoutes(
      routeMetrics,
      transactions,
      criticalErrorRate,
      warningErrorRate,
      criticalApprovalRate,
      warningApprovalRate,
    );

    const filteredRoutes = query.only_issues
      ? routes.filter((r) => r.overallStatus !== NodeStatus.OK)
      : routes;

    const summary = {
      total_routes: filteredRoutes.length,
      critical_routes: filteredRoutes.filter(
        (r) => r.overallStatus === NodeStatus.CRITICAL,
      ).length,
      warning_routes: filteredRoutes.filter(
        (r) => r.overallStatus === NodeStatus.WARNING,
      ).length,
      ok_routes: filteredRoutes.filter((r) => r.overallStatus === NodeStatus.OK)
        .length,
    };

    return {
      routes: filteredRoutes,
      summary,
      timestamp: new Date(),
    };
  }

  private async getRouteMetrics(
    startTime: Date,
    query: QueryHealthGraphDto,
  ): Promise<{
    routeMetrics: Map<string, RouteMetrics>;
    transactions: Transaction[];
  }> {
    // Primero obtener transacciones en la ventana de tiempo
    const txQueryBuilder = this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder('t')
      .where('t.date >= :startTime', { startTime });

    if (query.merchant_id) {
      txQueryBuilder.andWhere('t.merchant_id = :merchant_id', {
        merchant_id: query.merchant_id,
      });
    }
    if (query.provider_id) {
      txQueryBuilder.andWhere('t.provider_id = :provider_id', {
        provider_id: query.provider_id,
      });
    }
    if (query.method_id) {
      txQueryBuilder.andWhere('t.method_id = :method_id', {
        method_id: query.method_id,
      });
    }
    if (query.country_code) {
      txQueryBuilder.andWhere('t.country_code = :country_code', {
        country_code: query.country_code,
      });
    }

    const transactions = await txQueryBuilder.getMany();

    if (transactions.length === 0) {
      return { routeMetrics: new Map(), transactions: [] };
    }

    // Obtener entidades únicas
    const merchantIds = [
      ...new Set(transactions.map((t) => t.merchant_id).filter(Boolean)),
    ];
    const providerIds = [
      ...new Set(transactions.map((t) => t.provider_id).filter(Boolean)),
    ];
    const methodIds = [
      ...new Set(transactions.map((t) => t.method_id).filter(Boolean)),
    ];
    const countryCodes = [
      ...new Set(transactions.map((t) => t.country_code).filter(Boolean)),
    ];

    const merchants = await this.merchantRepository.findByIds(merchantIds);
    const providers = await this.providerRepository.findByIds(providerIds);
    const methods = await this.paymentMethodRepository.findByIds(methodIds);
    const countries = await this.countryRepository.find({
      where: countryCodes.map((code) => ({ code })),
    });

    const merchantMap = new Map(merchants.map((m) => [m.id, m.name]));
    const providerMap = new Map(providers.map((p) => [p.id, p.name]));
    const methodMap = new Map(methods.map((m) => [m.id, m.name]));
    const countryMap = new Map(countries.map((c) => [c.code, c.name]));

    // Agrupar transacciones por ruta
    const routeMetricsMap = new Map<string, RouteMetrics>();

    // Agrupar por merchant_id + provider_id + method_id + country_code
    const routeGroups = new Map<string, typeof transactions>();

    for (const tx of transactions) {
      const routeKey = this.getRouteKey({
        merchant_id: tx.merchant_id,
        provider_id: tx.provider_id,
        method_id: tx.method_id,
        country_code: tx.country_code,
      });

      if (!routeGroups.has(routeKey)) {
        routeGroups.set(routeKey, []);
      }
      routeGroups.get(routeKey)!.push(tx);
    }

    // Calcular métricas por ruta
    for (const [routeKey, txs] of routeGroups.entries()) {
      const [merchant_id, provider_id, method_id, country_code] =
        routeKey.split('|');

      const approved = txs.filter((t) => t.status === 'approved').length;
      const errors = txs.filter(
        (t) => t.status === 'error' || t.status === 'timeout',
      ).length;
      const total = txs.length;

      const approval_rate = total > 0 ? approved / total : 0;
      const error_rate = total > 0 ? errors / total : 0;

      // Calcular p95 de latencia
      const latencies = txs.map((t) => t.latency_ms || 0).sort((a, b) => a - b);
      const p95_index = Math.ceil(0.95 * latencies.length) - 1;
      const p95_latency = latencies[Math.max(0, p95_index)] || 0;

      routeMetricsMap.set(routeKey, {
        approval_rate,
        error_rate,
        p95_latency,
        sample_size: total,
        merchant_name: merchantMap.get(merchant_id) || 'Unknown Merchant',
        provider_name: providerMap.get(provider_id) || 'Unknown Provider',
        method_name: methodMap.get(method_id) || 'Unknown Method',
        country_name: countryMap.get(country_code) || 'Unknown Country',
      });
    }

    return { routeMetrics: routeMetricsMap, transactions };
  }

  private async buildPaymentRoutes(
    routeMetricsMap: Map<string, RouteMetrics>,
    allTransactions: Transaction[],
    criticalErrorRate: number,
    warningErrorRate: number,
    criticalApprovalRate: number,
    warningApprovalRate: number,
  ): Promise<PaymentRoute[]> {
    const routes: PaymentRoute[] = [];

    // Precalcular métricas por cada nivel de agregación usando SOLO las transacciones filtradas
    const metricsByMerchant = this.calculateMetricsByDimension(
      allTransactions,
      ['merchant_id'],
    );
    const metricsByProvider = this.calculateMetricsByDimension(
      allTransactions,
      ['provider_id'],
    );
    const metricsByMethod = this.calculateMetricsByDimension(allTransactions, [
      'method_id',
    ]);
    const metricsByCountry = this.calculateMetricsByDimension(allTransactions, [
      'country_code',
    ]);

    const metricsByMerchantProvider = this.calculateMetricsByDimension(
      allTransactions,
      ['merchant_id', 'provider_id'],
    );
    const metricsByProviderMethod = this.calculateMetricsByDimension(
      allTransactions,
      ['provider_id', 'method_id'],
    );
    const metricsByMethodCountry = this.calculateMetricsByDimension(
      allTransactions,
      ['method_id', 'country_code'],
    );

    for (const [routeKey, routeMetrics] of routeMetricsMap.entries()) {
      const [merchant_id, provider_id, method_id, country_code] =
        routeKey.split('|');

      // Determinar el estado general de la ruta
      const status = this.determineRouteStatus(
        routeMetrics,
        criticalErrorRate,
        warningErrorRate,
        criticalApprovalRate,
        warningApprovalRate,
      );

      // Obtener métricas específicas por nivel
      const merchantMetrics =
        metricsByMerchant.get(merchant_id) || routeMetrics;
      const providerMetrics =
        metricsByProvider.get(provider_id) || routeMetrics;
      const methodMetrics = metricsByMethod.get(method_id) || routeMetrics;
      const countryMetrics = metricsByCountry.get(country_code) || routeMetrics;

      const merchantProviderMetrics =
        metricsByMerchantProvider.get(`${merchant_id}|${provider_id}`) ||
        routeMetrics;
      const providerMethodMetrics =
        metricsByProviderMethod.get(`${provider_id}|${method_id}`) ||
        routeMetrics;
      const methodCountryMetrics =
        metricsByMethodCountry.get(`${method_id}|${country_code}`) ||
        routeMetrics;

      // Crear nodos con sus métricas específicas
      const merchantNode: GraphNode = {
        id: `merchant-${merchant_id}`,
        label: routeMetrics.merchant_name,
        type: 'merchant',
        status: this.determineRouteStatus(
          merchantMetrics,
          criticalErrorRate,
          warningErrorRate,
          criticalApprovalRate,
          warningApprovalRate,
        ),
        metrics: {
          approval_rate: merchantMetrics.approval_rate,
          error_rate: merchantMetrics.error_rate,
          p95_latency: merchantMetrics.p95_latency,
          sample_size: merchantMetrics.sample_size,
        },
      };

      const providerNode: GraphNode = {
        id: `provider-${provider_id}`,
        label: routeMetrics.provider_name,
        type: 'provider',
        status: this.determineRouteStatus(
          providerMetrics,
          criticalErrorRate,
          warningErrorRate,
          criticalApprovalRate,
          warningApprovalRate,
        ),
        metrics: {
          approval_rate: providerMetrics.approval_rate,
          error_rate: providerMetrics.error_rate,
          p95_latency: providerMetrics.p95_latency,
          sample_size: providerMetrics.sample_size,
        },
      };

      const methodNode: GraphNode = {
        id: `method-${method_id}`,
        label: routeMetrics.method_name,
        type: 'method',
        status: this.determineRouteStatus(
          methodMetrics,
          criticalErrorRate,
          warningErrorRate,
          criticalApprovalRate,
          warningApprovalRate,
        ),
        metrics: {
          approval_rate: methodMetrics.approval_rate,
          error_rate: methodMetrics.error_rate,
          p95_latency: methodMetrics.p95_latency,
          sample_size: methodMetrics.sample_size,
        },
      };

      const countryNode: GraphNode = {
        id: `country-${country_code}`,
        label: routeMetrics.country_name,
        type: 'country',
        status: this.determineRouteStatus(
          countryMetrics,
          criticalErrorRate,
          warningErrorRate,
          criticalApprovalRate,
          warningApprovalRate,
        ),
        metrics: {
          approval_rate: countryMetrics.approval_rate,
          error_rate: countryMetrics.error_rate,
          p95_latency: countryMetrics.p95_latency,
          sample_size: countryMetrics.sample_size,
        },
      };

      // Crear edges con métricas específicas de cada conexión
      const edges: GraphEdge[] = [
        {
          from: merchantNode.id,
          to: providerNode.id,
          status: this.mapNodeStatusToEdgeStatus(
            this.determineRouteStatus(
              merchantProviderMetrics,
              criticalErrorRate,
              warningErrorRate,
              criticalApprovalRate,
              warningApprovalRate,
            ),
          ),
          label: this.getEdgeLabel(
            this.determineRouteStatus(
              merchantProviderMetrics,
              criticalErrorRate,
              warningErrorRate,
              criticalApprovalRate,
              warningApprovalRate,
            ),
            merchantProviderMetrics,
          ),
          metrics: {
            approval_rate: merchantProviderMetrics.approval_rate,
            error_rate: merchantProviderMetrics.error_rate,
            p95_latency: merchantProviderMetrics.p95_latency,
          },
        },
        {
          from: providerNode.id,
          to: methodNode.id,
          status: this.mapNodeStatusToEdgeStatus(
            this.determineRouteStatus(
              providerMethodMetrics,
              criticalErrorRate,
              warningErrorRate,
              criticalApprovalRate,
              warningApprovalRate,
            ),
          ),
          label: this.getEdgeLabel(
            this.determineRouteStatus(
              providerMethodMetrics,
              criticalErrorRate,
              warningErrorRate,
              criticalApprovalRate,
              warningApprovalRate,
            ),
            providerMethodMetrics,
          ),
          metrics: {
            approval_rate: providerMethodMetrics.approval_rate,
            error_rate: providerMethodMetrics.error_rate,
            p95_latency: providerMethodMetrics.p95_latency,
          },
        },
        {
          from: methodNode.id,
          to: countryNode.id,
          status: this.mapNodeStatusToEdgeStatus(
            this.determineRouteStatus(
              methodCountryMetrics,
              criticalErrorRate,
              warningErrorRate,
              criticalApprovalRate,
              warningApprovalRate,
            ),
          ),
          label: this.getEdgeLabel(
            this.determineRouteStatus(
              methodCountryMetrics,
              criticalErrorRate,
              warningErrorRate,
              criticalApprovalRate,
              warningApprovalRate,
            ),
            methodCountryMetrics,
          ),
          metrics: {
            approval_rate: methodCountryMetrics.approval_rate,
            error_rate: methodCountryMetrics.error_rate,
            p95_latency: methodCountryMetrics.p95_latency,
          },
        },
      ];

      routes.push({
        merchant: merchantNode,
        provider: providerNode,
        method: methodNode,
        country: countryNode,
        overallStatus: status,
        edges,
      });
    }

    return routes;
  }

  private calculateMetricsByDimension(
    transactions: Transaction[],
    dimensions: string[],
  ): Map<string, RouteMetrics> {
    const grouped = new Map<string, Transaction[]>();

    for (const tx of transactions) {
      const key = dimensions
        .map((dim) => {
          if (dim === 'merchant_id') return tx.merchant_id;
          if (dim === 'provider_id') return tx.provider_id;
          if (dim === 'method_id') return tx.method_id;
          if (dim === 'country_code') return tx.country_code;
          return '';
        })
        .join('|');

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(tx);
    }

    const metricsMap = new Map<string, RouteMetrics>();

    for (const [key, txs] of grouped.entries()) {
      const approved = txs.filter((t) => t.status === 'approved').length;
      const errors = txs.filter(
        (t) => t.status === 'error' || t.status === 'timeout',
      ).length;
      const total = txs.length;

      const approval_rate = total > 0 ? approved / total : 0;
      const error_rate = total > 0 ? errors / total : 0;

      const latencies = txs.map((t) => t.latency_ms || 0).sort((a, b) => a - b);
      const p95_index = Math.ceil(0.95 * latencies.length) - 1;
      const p95_latency = latencies[Math.max(0, p95_index)] || 0;

      metricsMap.set(key, {
        approval_rate,
        error_rate,
        p95_latency,
        sample_size: total,
        merchant_name: '',
        provider_name: '',
        method_name: '',
        country_name: '',
      });
    }

    return metricsMap;
  }

  private determineRouteStatus(
    metrics: RouteMetrics,
    criticalErrorRate: number,
    warningErrorRate: number,
    criticalApprovalRate: number,
    warningApprovalRate: number,
  ): NodeStatus {
    if (
      metrics.error_rate >= criticalErrorRate ||
      metrics.approval_rate <= criticalApprovalRate ||
      metrics.sample_size < 10
    ) {
      return NodeStatus.CRITICAL;
    }

    if (
      metrics.error_rate >= warningErrorRate ||
      metrics.approval_rate <= warningApprovalRate ||
      metrics.p95_latency > 5000
    ) {
      return NodeStatus.WARNING;
    }

    return NodeStatus.OK;
  }

  private mapNodeStatusToEdgeStatus(nodeStatus: NodeStatus): EdgeStatus {
    switch (nodeStatus) {
      case NodeStatus.CRITICAL:
        return EdgeStatus.CRITICAL;
      case NodeStatus.WARNING:
        return EdgeStatus.WARNING;
      default:
        return EdgeStatus.OK;
    }
  }

  private getEdgeLabel(status: NodeStatus, metrics: RouteMetrics): string {
    switch (status) {
      case NodeStatus.CRITICAL:
        return `Fallos consistentes (error: ${(metrics.error_rate * 100).toFixed(1)}%)`;
      case NodeStatus.WARNING:
        return `Señal - muestra baja (${metrics.sample_size} txs)`;
      default:
        return `OK (aprobación: ${(metrics.approval_rate * 100).toFixed(1)}%)`;
    }
  }

  private getRouteKey(route: RouteKey): string {
    return `${route.merchant_id}|${route.provider_id}|${route.method_id}|${route.country_code}`;
  }
}
