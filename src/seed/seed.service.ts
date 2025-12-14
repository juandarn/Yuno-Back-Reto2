import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

// Ajusta imports según tus enums/ubicación real:
import { TxStatus } from '../common/enums';

// Ajusta imports de entidades a tu estructura real:
import { Merchant } from '../merchant/entities/merchant.entity';
import { User } from '../user/entities/user.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { Provider } from '../provider/entities/provider.entity';
import { PaymentMethod } from '../payment-method/entities/payment-method.entity';
import { Country } from '../country/entities/country.entity';
import { Metric } from '../metric/entities/metric.entity';
import { Alert } from '../alert/entities/alert.entity';
import { OnCallSchedule } from '../on-call/entities/on-call-schedule.entity';
import { Notification } from '../notification/entities/notification.entity';
import { NotificationChannel } from '../notification-channel/entities/notification-channel.entity';

type SeedOptions = { reset?: boolean };

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

@Injectable()
export class SeedService {
  constructor(private readonly dataSource: DataSource) {}

  async seed(opts: SeedOptions = {}) {
    const reset = !!opts.reset;

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      // Repos
      const countryRepo = runner.manager.getRepository(Country);
      const methodRepo = runner.manager.getRepository(PaymentMethod);
      const providerRepo = runner.manager.getRepository(Provider);
      const merchantRepo = runner.manager.getRepository(Merchant);
      const userRepo = runner.manager.getRepository(User);
      const channelRepo = runner.manager.getRepository(NotificationChannel);
      const txRepo = runner.manager.getRepository(Transaction);
      const metricRepo = runner.manager.getRepository(Metric);
      const alertRepo = runner.manager.getRepository(Alert);
      const notifRepo = runner.manager.getRepository(Notification);

      // ------------------------------------------------------------------
      // Reset opcional (limpia todo y vuelve a sembrar)
      // ------------------------------------------------------------------
      if (reset) {
        await runner.query(`
          TRUNCATE TABLE
            "risk_notifications",
            "notifications",
            "alerts",
            "metrics",
            "TRANSACTIONS",
            "USERS",
            "on_call_schedule",
            "notification_channel",
            "MERCHANTS",
            "providers",
            "payment_method",
            "countries"
          RESTART IDENTITY CASCADE;
        `);
      }

      // Si ya existe data, evita duplicar (modo no-reset)
      const existingMerchants = await merchantRepo.count();
      if (!reset && existingMerchants > 0) {
        throw new BadRequestException(
          'Seed already ran (merchants exist). Use POST /seed?reset=true to reseed.',
        );
      }

      // ------------------------------------------------------------------
      // 1) Catálogos
      // ------------------------------------------------------------------
      const countries = await countryRepo.save([
        { code: 'CO', name: 'Colombia' },
        { code: 'MX', name: 'Mexico' },
        { code: 'BR', name: 'Brazil' },
        { code: 'US', name: 'United States' },
        { code: 'AR', name: 'Argentina' },
      ]);

      const methods = await methodRepo.save([
        { name: 'Tarjeta de Crédito' },
        { name: 'PSE' },
        { name: 'Transferencia Bancaria' },
        { name: 'Wallet Digital' },
        { name: 'Efectivo' },
      ]);

      const providers = await providerRepo.save([
        { name: 'Stripe' },
        { name: 'Adyen' },
        { name: 'DLocal' },
        { name: 'PayU' },
        { name: 'Zoop' },
      ]);

      // ------------------------------------------------------------------
      // 2) Merchants (más variedad para testing)
      // ------------------------------------------------------------------
      const merchants = await merchantRepo.save([
        { name: 'Shopito' },      // Merchant OK
        { name: 'StoreX' },       // Merchant MEDIUM risk
        { name: 'MegaStore' },    // Merchant HIGH risk  
        { name: 'FastPay' },      // Merchant CRITICAL risk
        { name: 'SecureShop' },   // Merchant OK
      ]);

      // ------------------------------------------------------------------
      // 3) Users
      // ------------------------------------------------------------------
      const yunoUsers = await userRepo.save([
        { email: 'j.manriquec@uniandes.edu.co', name: 'Yuno Admin', type: 'YUNO', active: true },
        { email: 'support@yuno.com', name: 'Yuno Support', type: 'YUNO', active: true },
        { email: 'ops@yuno.com', name: 'Yuno Operations', type: 'YUNO', active: true },
      ]);

      const merchantUsers: User[] = [];
      for (const m of merchants) {
        merchantUsers.push(
          userRepo.create({
            email: `admin@${String(m.name).toLowerCase().replace(/\s+/g, '')}.com`,
            name: `${m.name} Admin`,
            type: 'MERCHANT',
            merchant_id: m.id,
            active: true,
          }),
        );
      }
      await userRepo.save(merchantUsers);

      // ------------------------------------------------------------------
      // 3.1) On-call schedule
      // ------------------------------------------------------------------
      const onCallRepo = runner.manager.getRepository(OnCallSchedule);
      const nowOnCall = new Date();
      
      if (yunoUsers?.length) {
        const schedules: Partial<OnCallSchedule>[] = yunoUsers.map((user, index) => ({
          user_id: user.id,
          priority: index + 1,
          active: true,
          start_at: nowOnCall,
        }));

        await onCallRepo.save(schedules.map((s) => onCallRepo.create(s)));
      }

      // ------------------------------------------------------------------
      // 4) Notification channels
      // ------------------------------------------------------------------
      const channels = await channelRepo.save([
        {
          name: 'gmail',  // ✅ Debe ser 'gmail' para coincidir con GmailChannel
          activo: true,
          config: { from: 'noreply@yuno-hackaton.local' },
        },
        {
          name: 'slack',
          activo: true,
          config: { webhookUrl: 'https://example.com/fake-slack-webhook', channel: '#alerts' },
        },
      ]);

      // ------------------------------------------------------------------
      // 5) Transacciones - ESCENARIOS DISEÑADOS PARA FAILURE PREDICTION
      // ------------------------------------------------------------------
      const now = new Date();
      const txsToInsert: Transaction[] = [];

      const makeTx = (p: {
        date: Date;
        merchant_id: any;
        provider_id: any;
        method_id: any;
        country_code: string;
        status: TxStatus;
        latency_ms: number;
        error_type?: any;
      }): any => {
        const base: any = {
          date: p.date,
          merchant_id: p.merchant_id,
          provider_id: p.provider_id,
          method_id: p.method_id,
          country_code: p.country_code,
          status: p.status,
          latency_ms: p.latency_ms,
        };

        if (p.error_type !== undefined) base.error_type = p.error_type;

        return txRepo.create(base);
      };

      // ================================================================
      // ESCENARIO 1: Shopito - BASELINE OK (últimas 24h) + DEGRADACIÓN RECIENTE (última hora)
      // ================================================================
      // Esto generará un riesgo MEDIUM porque la última hora está peor que el baseline
      
      // Baseline (23 horas atrás hasta 1 hora atrás): 95% approval
      for (let i = 0; i < 200; i++) {
        const minutesAgo = randInt(60, 23 * 60); // Entre 1h y 23h atrás
        const date = new Date(now.getTime() - minutesAgo * 60000);
        const status = Math.random() < 0.95 ? TxStatus.APPROVED : TxStatus.DECLINED;

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[0].id, // Shopito
            provider_id: providers[0].id,
            method_id: methods[0].id,
            country_code: 'CO',
            status,
            latency_ms: randInt(200, 500),
          }),
        );
      }

      // Última hora: DEGRADACIÓN - 75% approval, 20% errores
      for (let i = 0; i < 100; i++) {
        const minutesAgo = randInt(1, 60); // Última hora
        const date = new Date(now.getTime() - minutesAgo * 60000);
        
        let status: TxStatus;
        let error_type: string | undefined;
        let latency_ms: number;

        const r = Math.random();
        if (r < 0.75) {
          status = TxStatus.APPROVED;
          latency_ms = randInt(300, 800);
        } else if (r < 0.95) {
          status = TxStatus.DECLINED;
          latency_ms = randInt(400, 1000);
        } else {
          status = TxStatus.ERROR;
          error_type = 'network';
          latency_ms = randInt(2000, 5000);
        }

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[0].id,
            provider_id: providers[0].id,
            method_id: methods[0].id,
            country_code: 'CO',
            status,
            error_type,
            latency_ms,
          }),
        );
      }

      // ================================================================
      // ESCENARIO 2: StoreX - RIESGO MEDIO SOSTENIDO
      // ================================================================
      // Error rate constante del 25%, latencia alta
      
      for (let i = 0; i < 250; i++) {
        const minutesAgo = randInt(1, 60); // Última hora
        const date = new Date(now.getTime() - minutesAgo * 60000);

        let status: TxStatus;
        let error_type: string | undefined;
        let latency_ms: number;

        const r = Math.random();
        if (r < 0.65) {
          status = TxStatus.APPROVED;
          latency_ms = randInt(800, 2000);
        } else if (r < 0.85) {
          status = TxStatus.DECLINED;
          latency_ms = randInt(600, 1500);
        } else {
          status = TxStatus.ERROR;
          error_type = 'provider_error';
          latency_ms = randInt(2000, 4000);
        }

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[1].id, // StoreX
            provider_id: providers[1].id,
            method_id: methods[1].id,
            country_code: 'CO',
            status,
            error_type,
            latency_ms,
          }),
        );
      }

      // ================================================================
      // ESCENARIO 3: MegaStore - RIESGO ALTO (Error rate 40%)
      // ================================================================
      
      for (let i = 0; i < 200; i++) {
        const minutesAgo = randInt(1, 60);
        const date = new Date(now.getTime() - minutesAgo * 60000);

        let status: TxStatus;
        let error_type: string | undefined;
        let latency_ms: number;

        const r = Math.random();
        if (r < 0.50) {
          status = TxStatus.APPROVED;
          latency_ms = randInt(1000, 3000);
        } else if (r < 0.70) {
          status = TxStatus.DECLINED;
          latency_ms = randInt(800, 2000);
        } else if (r < 0.90) {
          status = TxStatus.ERROR;
          error_type = 'timeout';
          latency_ms = randInt(5000, 10000);
        } else {
          status = TxStatus.TIMEOUT;
          error_type = 'timeout';
          latency_ms = randInt(8000, 15000);
        }

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[2].id, // MegaStore
            provider_id: providers[2].id,
            method_id: methods[1].id,
            country_code: 'CO',
            status,
            error_type,
            latency_ms,
          }),
        );
      }

      // ================================================================
      // ESCENARIO 4: FastPay - CRÍTICO (Error rate >50%, casi caído)
      // ================================================================
      
      for (let i = 0; i < 150; i++) {
        const minutesAgo = randInt(1, 60);
        const date = new Date(now.getTime() - minutesAgo * 60000);

        let status: TxStatus;
        let error_type: string | undefined;
        let latency_ms: number;

        const r = Math.random();
        if (r < 0.30) {
          status = TxStatus.APPROVED;
          latency_ms = randInt(2000, 5000);
        } else if (r < 0.45) {
          status = TxStatus.DECLINED;
          latency_ms = randInt(1500, 3000);
        } else if (r < 0.75) {
          status = TxStatus.ERROR;
          error_type = 'provider_down';
          latency_ms = randInt(8000, 15000);
        } else {
          status = TxStatus.TIMEOUT;
          error_type = 'timeout';
          latency_ms = randInt(10000, 20000);
        }

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[3].id, // FastPay
            provider_id: providers[3].id,
            method_id: methods[2].id,
            country_code: 'BR',
            status,
            error_type,
            latency_ms,
          }),
        );
      }

      // ================================================================
      // ESCENARIO 5: SecureShop - TODO OK (para contraste)
      // ================================================================
      
      for (let i = 0; i < 150; i++) {
        const minutesAgo = randInt(1, 60);
        const date = new Date(now.getTime() - minutesAgo * 60000);
        const status = Math.random() < 0.96 ? TxStatus.APPROVED : TxStatus.DECLINED;

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[4].id, // SecureShop
            provider_id: providers[0].id,
            method_id: methods[3].id,
            country_code: 'MX',
            status,
            latency_ms: randInt(200, 400),
          }),
        );
      }

      // ================================================================
      // ESCENARIO 6: Provider Zoop - CRÍTICO (afecta a todos los merchants)
      // ================================================================
      
      for (const merchant of [merchants[0], merchants[1], merchants[2]]) {
        for (let i = 0; i < 50; i++) {
          const minutesAgo = randInt(1, 60);
          const date = new Date(now.getTime() - minutesAgo * 60000);

          let status: TxStatus;
          let error_type: string | undefined;
          let latency_ms: number;

          const r = Math.random();
          if (r < 0.25) {
            status = TxStatus.APPROVED;
            latency_ms = randInt(3000, 7000);
          } else if (r < 0.35) {
            status = TxStatus.DECLINED;
            latency_ms = randInt(2000, 5000);
          } else if (r < 0.70) {
            status = TxStatus.ERROR;
            error_type = 'provider_down';
            latency_ms = randInt(8000, 15000);
          } else {
            status = TxStatus.TIMEOUT;
            error_type = 'timeout';
            latency_ms = randInt(10000, 20000);
          }

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchant.id,
              provider_id: providers[4].id, // Zoop
              method_id: methods[1].id,
              country_code: 'AR',
              status,
              error_type,
              latency_ms,
            }),
          );
        }
      }

      // ================================================================
      // ESCENARIO 7: Método PSE en Colombia - RIESGO MEDIO
      // ================================================================
      
      for (const merchant of merchants) {
        for (let i = 0; i < 30; i++) {
          const minutesAgo = randInt(1, 60);
          const date = new Date(now.getTime() - minutesAgo * 60000);

          let status: TxStatus;
          let error_type: string | undefined;
          let latency_ms: number;

          const r = Math.random();
          if (r < 0.70) {
            status = TxStatus.APPROVED;
            latency_ms = randInt(1000, 2500);
          } else if (r < 0.90) {
            status = TxStatus.DECLINED;
            latency_ms = randInt(800, 1800);
          } else {
            status = TxStatus.ERROR;
            error_type = 'bank_error';
            latency_ms = randInt(3000, 6000);
          }

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchant.id,
              provider_id: providers[randInt(0, 1)].id,
              method_id: methods[1].id, // PSE
              country_code: 'CO',
              status,
              error_type,
              latency_ms,
            }),
          );
        }
      }

      // ================================================================
      // BASELINE DATA (últimas 24h) para tener comparación
      // ================================================================
      
      for (const merchant of merchants) {
        for (let i = 0; i < 50; i++) {
          const hoursAgo = randInt(2, 24);
          const date = new Date(now.getTime() - hoursAgo * 3600000);
          const status = Math.random() < 0.90 ? TxStatus.APPROVED : TxStatus.DECLINED;

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchant.id,
              provider_id: providers[randInt(0, 3)].id,
              method_id: methods[randInt(0, 3)].id,
              country_code: ['CO', 'MX', 'BR'][randInt(0, 2)],
              status,
              latency_ms: randInt(300, 1000),
            }),
          );
        }
      }

      const insertedTxs = await txRepo.save(txsToInsert);

      // ------------------------------------------------------------------
      // 6) Métricas agregadas (simplificado)
      // ------------------------------------------------------------------
      const byDay = new Map<string, Transaction[]>();
      for (const t of insertedTxs) {
        const d: Date = (t as any).date instanceof Date ? (t as any).date : new Date((t as any).date);
        const dayKey = d.toISOString().slice(0, 10);
        if (!byDay.has(dayKey)) byDay.set(dayKey, []);
        byDay.get(dayKey)!.push(t);
      }

      const createdAlerts: Alert[] = [];
      const TH_ERROR_RATE_WARNING = 0.15;
      const TH_ERROR_RATE_CRIT = 0.30;

      for (const [dayKey, txs] of byDay.entries()) {
        const start = new Date(`${dayKey}T00:00:00.000Z`);
        const end = new Date(`${dayKey}T23:59:59.999Z`);

        for (const m of merchants) {
          const mTx = txs.filter(t => String((t as any).merchant_id) === String(m.id));
          if (!mTx.length) continue;

          const approved = mTx.filter(t => (t as any).status === TxStatus.APPROVED).length;
          const errors = mTx.filter(
            t => (t as any).status === TxStatus.ERROR || (t as any).status === TxStatus.TIMEOUT,
          ).length;

          const approvalRate = approved / mTx.length;
          const errorRate = errors / mTx.length;

          const latSorted = mTx.map(t => Number((t as any).latency_ms)).sort((a, b) => a - b);
          const p95 = percentile(latSorted, 95);

          const metrics = metricRepo.create([
            {
              start_window: start.toISOString(),
              end_window: end.toISOString(),
              type: 'approval_rate',
              value: approvalRate,
              sample: mTx.length,
              merchant_id: m.id,
            },
            {
              start_window: start.toISOString(),
              end_window: end.toISOString(),
              type: 'error_rate',
              value: errorRate,
              sample: mTx.length,
              merchant_id: m.id,
            },
            {
              start_window: start.toISOString(),
              end_window: end.toISOString(),
              type: 'p95_latency',
              value: p95,
              sample: mTx.length,
              merchant_id: m.id,
            },
          ] as any[]);

          const savedMetrics = await metricRepo.save(metrics as any);

          if (errorRate >= TH_ERROR_RATE_WARNING) {
            const severity = errorRate >= TH_ERROR_RATE_CRIT ? 'critical' : 'warning';
            const title = `High error rate for merchant ${m.name}`;
            const explanation =
              `Window: ${dayKey}\n` +
              `approval_rate=${approvalRate.toFixed(3)} | error_rate=${errorRate.toFixed(3)} | p95_latency=${Math.round(p95)}ms\n` +
              `sample=${mTx.length}`;

            const metricForAlert =
              (savedMetrics as any[]).find(mt => (mt as any).type === 'error_rate') ?? (savedMetrics as any[])[0];

            const alertEntity = alertRepo.create({
              metric_id: (metricForAlert as any).id,
              fecha: end,
              severity: severity,
              estado: 'open',
              title: title,
              explanation: explanation,
              merchant_id: m.id,
            } as any);

            const savedAlert = await alertRepo.save(alertEntity as any);
            createdAlerts.push(savedAlert);
          }
        }
      }

      await runner.commitTransaction();

      return {
        ok: true,
        reset,
        inserted: {
          countries: countries.length,
          payment_methods: methods.length,
          providers: providers.length,
          merchants: merchants.length,
          users: yunoUsers.length + merchantUsers.length,
          on_call_schedules: yunoUsers.length,
          notification_channels: channels.length,
          transactions: insertedTxs.length,
          alerts: createdAlerts.length,
        },
        failure_prediction_scenarios: {
          low_risk: ['SecureShop'],
          medium_risk: ['Shopito (degradación reciente)', 'StoreX', 'PSE method'],
          high_risk: ['MegaStore'],
          critical_risk: ['FastPay', 'Zoop provider'],
          description: 'Datos generados para demostrar failure prediction en diferentes niveles de riesgo',
        },
        expected_predictions: {
          merchants: {
            shopito: 'MEDIUM - Degradación en última hora vs baseline',
            storeX: 'MEDIUM - Error rate 25% sostenido',
            megaStore: 'HIGH - Error rate 40%',
            fastPay: 'CRITICAL - Error rate >50%, casi caído',
            secureShop: 'LOW - Todo funcionando bien (96% approval)',
          },
          providers: {
            zoop: 'CRITICAL - Error rate >65%, afectando múltiples merchants',
          },
          methods: {
            pse: 'MEDIUM - Error rate ~20% en Colombia',
          },
        },
        endpoint: 'POST /seed',
      };
    } catch (err) {
      await runner.rollbackTransaction();
      throw err;
    } finally {
      await runner.release();
    }
  }
}