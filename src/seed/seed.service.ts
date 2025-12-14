import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { TxStatus } from '../common/enums';
import type { DeepPartial } from 'typeorm';
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

// Helpers UTC (importante para que case con tu lógica de forecast)
function startOfDayUTC(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function addDaysUTC(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}
function randomTimeWithinUTCDate(dayStartUTC: Date) {
  const d = new Date(dayStartUTC);
  d.setUTCHours(randInt(0, 23), randInt(0, 59), randInt(0, 59), 0);
  return d;
}
function pickRandomDayStartUTC(daysBack: number, base = new Date()) {
  const todayStart = startOfDayUTC(base);
  const offset = -randInt(0, daysBack);
  return addDaysUTC(todayStart, offset);
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

      const existingMerchants = await merchantRepo.count();
      if (!reset && existingMerchants > 0) {
        throw new BadRequestException(
          'Seed already ran (merchants exist). Use POST /seed?reset=true to reseed.',
        );
      }

      // 1) Catálogos
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

      // 2) Merchants
      const merchants = await merchantRepo.save([
        { name: 'Shopito' },
        { name: 'StoreX' },
        { name: 'Zoop' },
      ]);

      // 3) Users
      const yunoUsers = await userRepo.save([
        {
          email: 'j.manriquec@uniandes.edu.co',
          name: 'Yuno Admin',
          type: 'YUNO',
          active: true,
        },
        {
          email: 'support@yuno.com',
          name: 'Yuno Support',
          type: 'YUNO',
          active: true,
        },
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

      // 3.1) On-call schedule
      const onCallRepo = runner.manager.getRepository(OnCallSchedule);
      const nowOnCall = new Date();

      if (yunoUsers?.length) {
        const schedules: Partial<OnCallSchedule>[] = [
          {
            user_id: yunoUsers[0].id,
            priority: 1,
            active: true,
            start_at: nowOnCall,
          },
        ];

        if (yunoUsers.length > 1) {
          schedules.push({
            user_id: yunoUsers[1].id,
            priority: 2,
            active: true,
            start_at: nowOnCall,
          });
        }

        await onCallRepo.save(schedules.map((s) => onCallRepo.create(s)));
      }

      // 4) Notification channels
      const channels = await channelRepo.save([
        {
          name: 'gmail',
          activo: true,
          config: { from: 'noreply@yuno-hackaton.local' },
        },
        {
          name: 'slack',
          activo: true,
          config: {
            webhookUrl: 'https://example.com/fake-slack-webhook',
            channel: '#alerts',
          },
        },
      ]);

      // 5) Transacciones
      const txsToInsert: Transaction[] = [];

      // Nota: provider_id y method_id son number en tu caso.
      // merchant_id es UUID string.
      const makeTx = (p: {
        date: Date;
        merchant_id: string;
        provider_id: number;
        method_id: number;
        country_code: string;
        status: TxStatus;
        latency_ms: number;
        error_type?: string;
      }): Transaction => {
        const base: DeepPartial<Transaction> = {
          date: p.date,
          merchant_id: p.merchant_id,
          provider_id: p.provider_id as any,
          method_id: p.method_id as any,
          country_code: p.country_code,
          status: p.status,
          latency_ms: p.latency_ms,
        };

        if (p.error_type !== undefined) (base as any).error_type = p.error_type;

        const entity = txRepo.create(base); // aqui TS puede inferir Transaction | Transaction[]
        return entity as Transaction; // forzamos el overload correcto
      };

      // ------------------------------------------------------------------
      // 5.1) BLOQUE CLAVE: 14 días exactos para expected vs actual
      // Semana pasada (expected) + semana actual (actual)
      // ------------------------------------------------------------------
      const todayStart = startOfDayUTC(new Date());
      const from = addDaysUTC(todayStart, -6);
      const to = addDaysUTC(todayStart, 1);
      const prevFrom = addDaysUTC(from, -7);
      const prevTo = addDaysUTC(to, -7);

      const testMerchant =
        merchants.find((m) => m.name === 'Zoop') ?? merchants[2];
      const testProvider = providers[0]; // Stripe
      const testMethod = methods[0]; // Tarjeta
      const testCountry = 'CO';

      const providerId = Number((testProvider as any).id);
      const methodId = Number((testMethod as any).id);

      // Patrón visible por día (7 + 7)
      const expectedWeek = [60, 75, 80, 70, 90, 65, 55];
      const actualWeek = [50, 70, 95, 60, 85, 80, 45];

      // Inserta 14 días consecutivos a partir de prevFrom (UTC day start)
      for (let i = 0; i < 14; i++) {
        const dayStart = addDaysUTC(prevFrom, i);
        const isPrevWeek = i < 7;
        const approvedCount = isPrevWeek ? expectedWeek[i] : actualWeek[i - 7];

        // Aprobadas (son las que cuenta tu forecast)
        for (let k = 0; k < approvedCount; k++) {
          txsToInsert.push(
            makeTx({
              date: randomTimeWithinUTCDate(dayStart),
              merchant_id: testMerchant.id,
              provider_id: providerId,
              method_id: methodId,
              country_code: testCountry,
              status: TxStatus.APPROVED,
              latency_ms: randInt(200, 900),
            }),
          );
        }

        // Ruido adicional (no afecta approved, pero sirve para dashboards)
        const noise = randInt(5, 20);
        for (let n = 0; n < noise; n++) {
          const r = Math.random();
          const status: TxStatus =
            r < 0.85
              ? TxStatus.DECLINED
              : r < 0.95
                ? TxStatus.ERROR
                : TxStatus.TIMEOUT;

          txsToInsert.push(
            makeTx({
              date: randomTimeWithinUTCDate(dayStart),
              merchant_id: testMerchant.id,
              provider_id: providerId,
              method_id: methodId,
              country_code: testCountry,
              status,
              error_type:
                status === TxStatus.ERROR
                  ? 'network'
                  : status === TxStatus.TIMEOUT
                    ? 'timeout'
                    : undefined,
              latency_ms: randInt(800, 6000),
            }),
          );
        }
      }

      // ------------------------------------------------------------------
      // 5.2) Tus escenarios previos (health graph), pero ahora distribuidos
      // en los últimos 30 días (no solo últimos 60 min).
      // ------------------------------------------------------------------
      const DAYS_BACK_HEALTH = 30;

      // ESCENARIO 1: OK - Shopito -> Stripe -> Tarjeta -> CO
      for (let i = 0; i < 150; i++) {
        const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
        const date = randomTimeWithinUTCDate(dayStart);
        const status: TxStatus =
          Math.random() < 0.95 ? TxStatus.APPROVED : TxStatus.DECLINED;

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[0].id,
            provider_id: Number((providers[0] as any).id),
            method_id: Number((methods[0] as any).id),
            country_code: 'CO',
            status,
            latency_ms: randInt(200, 500),
          }),
        );
      }

      // ESCENARIO 2: WARNING - StoreX -> Adyen -> PSE -> CO
      for (let i = 0; i < 100; i++) {
        const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
        const date = randomTimeWithinUTCDate(dayStart);

        let status: TxStatus = TxStatus.APPROVED;
        let error_type: string | undefined = undefined;
        let latency_ms = randInt(800, 2000);

        const r = Math.random();
        if (r < 0.65) {
          status = TxStatus.APPROVED;
          latency_ms = randInt(800, 2000);
        } else if (r < 0.82) {
          status = TxStatus.DECLINED;
          latency_ms = randInt(600, 1500);
        } else {
          status = TxStatus.ERROR;
          error_type = 'network';
          latency_ms = randInt(2000, 4000);
        }

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[1].id,
            provider_id: Number((providers[1] as any).id),
            method_id: Number((methods[1] as any).id),
            country_code: 'CO',
            status,
            error_type,
            latency_ms,
          }),
        );
      }

      // ESCENARIO 3: CRITICAL - múltiples merchants -> DLocal -> PSE -> CO
      for (const merchant of merchants) {
        for (let i = 0; i < 60; i++) {
          const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
          const date = randomTimeWithinUTCDate(dayStart);

          let status: TxStatus = TxStatus.APPROVED;
          let error_type: string | undefined = undefined;
          let latency_ms = randInt(3000, 6000);

          const r = Math.random();
          if (r < 0.35) {
            status = TxStatus.APPROVED;
            latency_ms = randInt(3000, 6000);
          } else if (r < 0.5) {
            status = TxStatus.DECLINED;
            latency_ms = randInt(2000, 4000);
          } else if (r < 0.8) {
            status = TxStatus.ERROR;
            error_type = 'provider_down';
            latency_ms = randInt(5000, 10000);
          } else {
            status = TxStatus.TIMEOUT;
            error_type = 'timeout';
            latency_ms = randInt(8000, 15000);
          }

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchant.id,
              provider_id: Number((providers[2] as any).id),
              method_id: Number((methods[1] as any).id),
              country_code: 'CO',
              status,
              error_type,
              latency_ms,
            }),
          );
        }
      }

      // ESCENARIO 4: misma ruta pero OK en México (contraste)
      for (let i = 0; i < 120; i++) {
        const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
        const date = randomTimeWithinUTCDate(dayStart);
        const status: TxStatus =
          Math.random() < 0.92 ? TxStatus.APPROVED : TxStatus.DECLINED;

        txsToInsert.push(
          makeTx({
            date,
            merchant_id: merchants[0].id,
            provider_id: Number((providers[2] as any).id),
            method_id: Number((methods[1] as any).id),
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
          const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
          const date = randomTimeWithinUTCDate(dayStart);
          const status: TxStatus =
            Math.random() < route.approval
              ? TxStatus.APPROVED
              : TxStatus.DECLINED;

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchants[route.merchant].id,
              provider_id: Number((providers[route.provider] as any).id),
              method_id: Number((methods[route.method] as any).id),
              country_code: route.country,
              status,
              latency_ms: randInt(300, 800),
            }),
          );
        }
      }

      const insertedTxs = await txRepo.save(txsToInsert);

      // 6) Métricas agregadas por merchant
      const byDay = new Map<string, Transaction[]>();
      for (const t of insertedTxs) {
        const d: Date =
          (t as any).date instanceof Date
            ? (t as any).date
            : new Date((t as any).date);
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
          const mTx = txs.filter(
            (t) => String((t as any).merchant_id) === String(m.id),
          );
          if (!mTx.length) continue;

          const approved = mTx.filter(
            (t) => (t as any).status === TxStatus.APPROVED,
          ).length;
          const errors = mTx.filter(
            (t) =>
              (t as any).status === TxStatus.ERROR ||
              (t as any).status === TxStatus.TIMEOUT,
          ).length;

          const approvalRate = approved / mTx.length;
          const errorRate = errors / mTx.length;

          const latSorted = mTx
            .map((t) => Number((t as any).latency_ms))
            .sort((a, b) => a - b);
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
            const severity =
              errorRate >= TH_ERROR_RATE_CRIT ? 'critical' : 'warning';
            const title = `High error rate for merchant ${m.name}`;
            const explanation =
              `Window: ${dayKey}\n` +
              `approval_rate=${approvalRate.toFixed(3)} | error_rate=${errorRate.toFixed(3)} | p95_latency=${Math.round(
                p95,
              )}ms\n` +
              `sample=${mTx.length}`;

            const metricForAlert =
              (savedMetrics as any[]).find(
                (mt) => (mt as any).type === 'error_rate',
              ) ?? (savedMetrics as any[])[0];

            const alertEntity = alertRepo.create({
              metric_id: (metricForAlert as any).id,
              fecha: end,
              severity,
              estado: 'open',
              title,
              explanation,
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
        ids: {
          merchants: merchants.map((m) => ({ id: m.id, name: m.name })),
          providers: providers.map((p: any) => ({
            id: Number(p.id),
            name: p.name,
          })),
          methods: methods.map((m: any) => ({
            id: Number(m.id),
            name: m.name,
          })),
          countries: countries.map((c: any) => ({
            code: c.code,
            name: c.name,
          })),
        },
        forecast_test_route: {
          merchant: { id: testMerchant.id, name: testMerchant.name },
          provider: { id: providerId, name: (testProvider as any).name },
          method: { id: methodId, name: (testMethod as any).name },
          country: testCountry,
          range: {
            prevFrom: prevFrom.toISOString(),
            prevTo: prevTo.toISOString(),
            from: from.toISOString(),
            to: to.toISOString(),
          },
          note: 'Se insertaron aprobadas diarias para 14 días (semana pasada expected y semana actual actual) con fechas en UTC.',
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
