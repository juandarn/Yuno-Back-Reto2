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
            "notifications",
            "alerts",
            "metrics",
            "TRANSACTIONS",
            "USERS",
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
      ]);

      const methods = await methodRepo.save([
        { name: 'Tarjeta de Crédito' },
        { name: 'PSE' },
        { name: 'Transferencia Bancaria' },
        { name: 'Wallet Digital' },
      ]);

      const providers = await providerRepo.save([
        { name: 'Stripe' },
        { name: 'Adyen' },
        { name: 'DLocal' },
        { name: 'PayU' },
      ]);

      // ------------------------------------------------------------------
      // 2) Merchants
      // ------------------------------------------------------------------
      const merchants = await merchantRepo.save([
        { name: 'Shopito' },
        { name: 'StoreX' },
        { name: 'Zoop' },
      ]);

      // ------------------------------------------------------------------
      // 3) Users
      // ------------------------------------------------------------------
      const yunoUsers = await userRepo.save([
        { email: 'admin@yuno.com', name: 'Yuno Admin', type: 'YUNO', active: true },
        { email: 'support@yuno.com', name: 'Yuno Support', type: 'YUNO', active: true },
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
      // 4) Notification channels
      // ------------------------------------------------------------------
      const channels = await channelRepo.save([
        {
          name: 'email',
          active: true,
          config: { from: 'noreply@yuno-hackaton.local' },
        },
        {
          name: 'slack',
          active: true,
          config: { webhookUrl: 'https://example.com/fake-slack-webhook', channel: '#alerts' },
        },
      ]);

      // ------------------------------------------------------------------
      // 5) Transacciones - escenarios específicos para health graph
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
          date: p.date, // IMPORTANTE: Date, no string
          merchant_id: p.merchant_id,
          provider_id: p.provider_id,
          method_id: p.method_id,
          country_code: p.country_code,
          status: p.status,
          latency_ms: p.latency_ms,
        };

        // IMPORTANTE: no usar null. Si no hay error, no seteamos error_type.
        if (p.error_type !== undefined) base.error_type = p.error_type;

        return txRepo.create(base);
      };

      // ESCENARIO 1: OK - Shopito -> Stripe -> Tarjeta -> CO
      for (let i = 0; i < 150; i++) {
        const date = new Date(now.getTime() - randInt(1, 60) * 60000);
        const status = Math.random() < 0.95 ? TxStatus.APPROVED : TxStatus.DECLINED;

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[0].id,
            provider_id: providers[0].id,
            method_id: methods[0].id,
            country_code: 'CO',
            status,
            latency_ms: randInt(200, 500),
          }),
        );
      }

      // ESCENARIO 2: WARNING - StoreX -> Adyen -> PSE -> CO
      for (let i = 0; i < 100; i++) {
        const date = new Date(now.getTime() - randInt(1, 60) * 60000);

        let status: TxStatus;
        let error_type: any = undefined;
        let latency: number;

        const r = Math.random();
        if (r < 0.65) {
          status = TxStatus.APPROVED;
          latency = randInt(800, 2000);
        } else if (r < 0.82) {
          status = TxStatus.DECLINED;
          latency = randInt(600, 1500);
        } else {
          status = TxStatus.ERROR;
          error_type = 'network';
          latency = randInt(2000, 4000);
        }

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[1].id,
            provider_id: providers[1].id,
            method_id: methods[1].id,
            country_code: 'CO',
            status,
            error_type,
            latency_ms: latency,
          }),
        );
      }

      // ESCENARIO 3: CRITICAL - múltiples merchants -> DLocal -> PSE -> CO
      for (const merchant of merchants) {
        for (let i = 0; i < 60; i++) {
          const date = new Date(now.getTime() - randInt(1, 60) * 60000);

          let status: TxStatus;
          let error_type: any = undefined;
          let latency: number;

          const r = Math.random();
          if (r < 0.35) {
            status = TxStatus.APPROVED;
            latency = randInt(3000, 6000);
          } else if (r < 0.5) {
            status = TxStatus.DECLINED;
            latency = randInt(2000, 4000);
          } else if (r < 0.8) {
            status = TxStatus.ERROR;
            error_type = 'provider_down';
            latency = randInt(5000, 10000);
          } else {
            status = TxStatus.TIMEOUT;
            error_type = 'timeout';
            latency = randInt(8000, 15000);
          }

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchant.id,
              provider_id: providers[2].id,
              method_id: methods[1].id,
              country_code: 'CO',
              status,
              error_type,
              latency_ms: latency,
            }),
          );
        }
      }

      // ESCENARIO 4: misma ruta pero OK en México (contraste)
      for (let i = 0; i < 120; i++) {
        const date = new Date(now.getTime() - randInt(1, 60) * 60000);
        const status = Math.random() < 0.92 ? TxStatus.APPROVED : TxStatus.DECLINED;

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[0].id,
            provider_id: providers[2].id,
            method_id: methods[1].id,
            country_code: 'MX',
            status,
            latency_ms: randInt(300, 700),
          }),
        );
      }

      // ESCENARIO 5: rutas OK extra para variedad
      const additionalRoutes = [
        { merchant: 1, provider: 0, method: 0, country: 'MX', approval: 0.88 },
        { merchant: 2, provider: 1, method: 2, country: 'BR', approval: 0.91 },
        { merchant: 0, provider: 3, method: 3, country: 'US', approval: 0.93 },
      ];

      for (const route of additionalRoutes) {
        for (let i = 0; i < 80; i++) {
          const date = new Date(now.getTime() - randInt(1, 60) * 60000);
          const status = Math.random() < route.approval ? TxStatus.APPROVED : TxStatus.DECLINED;

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchants[route.merchant].id,
              provider_id: providers[route.provider].id,
              method_id: methods[route.method].id,
              country_code: route.country,
              status,
              latency_ms: randInt(300, 800),
            }),
          );
        }
      }

      const insertedTxs = await txRepo.save(txsToInsert);

      // ------------------------------------------------------------------
      // 6) Métricas agregadas por merchant (como en el seed original)
      // ------------------------------------------------------------------
      const byDay = new Map<string, Transaction[]>();
      for (const t of insertedTxs) {
        const d: Date = (t as any).date instanceof Date ? (t as any).date : new Date((t as any).date);
        const dayKey = d.toISOString().slice(0, 10);
        if (!byDay.has(dayKey)) byDay.set(dayKey, []);
        byDay.get(dayKey)!.push(t);
      }

      const createdAlerts: Alert[] = [];
      const TH_ERROR_RATE_WARNING = 0.08;
      const TH_ERROR_RATE_CRIT = 0.15;

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

            // ✅ CORRECCIÓN: Usar nombres en INGLÉS
            const alertEntity = alertRepo.create({
              metric_id: (metricForAlert as any).id,  // ✅ metric_id (inglés)
              date: end,                              // ✅ date (inglés) 
              severity: severity,                     // ✅ severity (inglés)
              state: 'open',                          // ✅ state (inglés)
              title: title,                           // ✅ title (inglés)
              explanation: explanation,               // ✅ explanation (inglés)
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
          notification_channels: channels.length,
          transactions: insertedTxs.length,
          alerts: createdAlerts.length,
        },
        health_graph_scenarios: {
          ok_routes: 4,
          warning_routes: 1,
          critical_routes: 3,
          description: 'Datos generados para demostrar health-graph con escenarios específicos',
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