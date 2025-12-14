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

      // 1) Catálogos expandidos
      const countries = await countryRepo.save([
        { code: 'CO', name: 'Colombia' },
        { code: 'MX', name: 'Mexico' },
        { code: 'BR', name: 'Brazil' },
        { code: 'US', name: 'United States' },
        { code: 'AR', name: 'Argentina' },
        { code: 'CL', name: 'Chile' },
        { code: 'PE', name: 'Peru' },
      ]);

      const methods = await methodRepo.save([
        { name: 'Tarjeta de Crédito' },
        { name: 'PSE' },
        { name: 'Transferencia Bancaria' },
        { name: 'Wallet Digital' },
        { name: 'Efectivo' },
        { name: 'Débito' },
      ]);

      const providers = await providerRepo.save([
        { name: 'Stripe' },
        { name: 'Adyen' },
        { name: 'DLocal' },
        { name: 'PayU' },
        { name: 'MercadoPago' },
        { name: 'Ebanx' },
        { name: 'PayPal' },
        { name: 'Kushki' },
      ]);

      // 2) Merchants expandidos
      const merchants = await merchantRepo.save([
        { name: 'Shopito' },
        { name: 'StoreX' },
        { name: 'Zoop' },
        { name: 'TechMart' },
        { name: 'FashionHub' },
        { name: 'FoodExpress' },
        { name: 'ElectroMax' },
        { name: 'TravelPlus' },
        { name: 'BookStore' },
        { name: 'GameZone' },
        { name: 'PetShop' },
        { name: 'SportsPro' },
      ]);

      // 3) Users
      const yunoUsers = await userRepo.save([
        {
          email: 'j.manriquec@uniandes.edu.co',
          name: 'Yuno Admin',
          number: '+573143901412',
          type: 'YUNO',
          active: true,
        },
        {
          email: 'support@yuno.com',
          number: '+573143901412',
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
            number: '+573143901412',
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
        {
          name: 'whatsapp',
          activo: true,
          config: {
            from: '+573143901412',
          },
        },
      ]);

      // 5) Transacciones
      const txsToInsert: Transaction[] = [];

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

        const entity = txRepo.create(base);
        return entity as Transaction;
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

        // Ruido adicional
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
      // 5.2) ESCENARIOS EXPANDIDOS con más variedad
      // ------------------------------------------------------------------
      const DAYS_BACK_HEALTH = 30;

      // ESCENARIO 1: OK - Múltiples merchants con Stripe en diferentes países
      const stripeOkRoutes = [
        { merchant: 0, country: 'CO', approval: 0.95, latency: [200, 500] },
        { merchant: 3, country: 'MX', approval: 0.93, latency: [250, 600] },
        { merchant: 6, country: 'US', approval: 0.96, latency: [180, 450] },
        { merchant: 9, country: 'BR', approval: 0.92, latency: [300, 700] },
      ];

      for (const route of stripeOkRoutes) {
        for (let i = 0; i < 200; i++) {
          const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
          const date = randomTimeWithinUTCDate(dayStart);
          const status: TxStatus =
            Math.random() < route.approval ? TxStatus.APPROVED : TxStatus.DECLINED;

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchants[route.merchant].id,
              provider_id: Number((providers[0] as any).id), // Stripe
              method_id: Number((methods[0] as any).id), // Tarjeta
              country_code: route.country,
              status,
              latency_ms: randInt(route.latency[0], route.latency[1]),
            }),
          );
        }
      }

      // ESCENARIO 2: WARNING - Adyen con PSE en varios merchants
      const adyenWarningRoutes = [
        { merchant: 1, country: 'CO', approval: 0.75, errorRate: 0.15 },
        { merchant: 4, country: 'CO', approval: 0.72, errorRate: 0.18 },
        { merchant: 7, country: 'CO', approval: 0.78, errorRate: 0.12 },
      ];

      for (const route of adyenWarningRoutes) {
        for (let i = 0; i < 150; i++) {
          const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
          const date = randomTimeWithinUTCDate(dayStart);

          let status: TxStatus = TxStatus.APPROVED;
          let error_type: string | undefined = undefined;
          let latency_ms = randInt(800, 2000);

          const r = Math.random();
          if (r < route.approval) {
            status = TxStatus.APPROVED;
          } else if (r < route.approval + 0.1) {
            status = TxStatus.DECLINED;
          } else {
            status = TxStatus.ERROR;
            error_type = 'network';
            latency_ms = randInt(2000, 4000);
          }

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchants[route.merchant].id,
              provider_id: Number((providers[1] as any).id), // Adyen
              method_id: Number((methods[1] as any).id), // PSE
              country_code: route.country,
              status,
              error_type,
              latency_ms,
            }),
          );
        }
      }

      // ESCENARIO 3: CRITICAL - DLocal con múltiples problemas
      const dlocalCriticalRoutes = [
        { merchant: 2, country: 'CO', approval: 0.40, errorRate: 0.35 },
        { merchant: 5, country: 'MX', approval: 0.35, errorRate: 0.40 },
        { merchant: 8, country: 'BR', approval: 0.38, errorRate: 0.37 },
        { merchant: 10, country: 'AR', approval: 0.42, errorRate: 0.33 },
      ];

      for (const route of dlocalCriticalRoutes) {
        for (let i = 0; i < 180; i++) {
          const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
          const date = randomTimeWithinUTCDate(dayStart);

          let status: TxStatus = TxStatus.APPROVED;
          let error_type: string | undefined = undefined;
          let latency_ms = randInt(3000, 6000);

          const r = Math.random();
          if (r < route.approval) {
            status = TxStatus.APPROVED;
            latency_ms = randInt(3000, 6000);
          } else if (r < route.approval + 0.15) {
            status = TxStatus.DECLINED;
            latency_ms = randInt(2000, 4000);
          } else if (r < route.approval + 0.35) {
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
              merchant_id: merchants[route.merchant].id,
              provider_id: Number((providers[2] as any).id), // DLocal
              method_id: Number((methods[1] as any).id), // PSE
              country_code: route.country,
              status,
              error_type,
              latency_ms,
            }),
          );
        }
      }

      // ESCENARIO 4: PayU con rendimiento variado
      const payuMixedRoutes = [
        { merchant: 3, country: 'CO', approval: 0.88, latency: [400, 900] },
        { merchant: 6, country: 'MX', approval: 0.85, latency: [500, 1000] },
        { merchant: 9, country: 'AR', approval: 0.82, latency: [600, 1200] },
      ];

      for (const route of payuMixedRoutes) {
        for (let i = 0; i < 160; i++) {
          const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
          const date = randomTimeWithinUTCDate(dayStart);
          const status: TxStatus =
            Math.random() < route.approval ? TxStatus.APPROVED : TxStatus.DECLINED;

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchants[route.merchant].id,
              provider_id: Number((providers[3] as any).id), // PayU
              method_id: Number((methods[0] as any).id), // Tarjeta
              country_code: route.country,
              status,
              latency_ms: randInt(route.latency[0], route.latency[1]),
            }),
          );
        }
      }

      // ESCENARIO 5: MercadoPago - excelente en algunos países
      const mercadoPagoRoutes = [
        { merchant: 1, country: 'AR', approval: 0.97, latency: [200, 500] },
        { merchant: 4, country: 'BR', approval: 0.96, latency: [250, 550] },
        { merchant: 7, country: 'MX', approval: 0.94, latency: [300, 600] },
        { merchant: 11, country: 'CL', approval: 0.95, latency: [280, 580] },
      ];

      for (const route of mercadoPagoRoutes) {
        for (let i = 0; i < 190; i++) {
          const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
          const date = randomTimeWithinUTCDate(dayStart);
          const status: TxStatus =
            Math.random() < route.approval ? TxStatus.APPROVED : TxStatus.DECLINED;

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchants[route.merchant].id,
              provider_id: Number((providers[4] as any).id), // MercadoPago
              method_id: Number((methods[3] as any).id), // Wallet Digital
              country_code: route.country,
              status,
              latency_ms: randInt(route.latency[0], route.latency[1]),
            }),
          );
        }
      }

      // ESCENARIO 6: Ebanx - problemas específicos en Brasil
      const ebanxRoutes = [
        { merchant: 2, country: 'BR', approval: 0.68, errorRate: 0.22 },
        { merchant: 5, country: 'BR', approval: 0.65, errorRate: 0.25 },
        { merchant: 10, country: 'CL', approval: 0.89, errorRate: 0.05 }, // OK en Chile
      ];

      for (const route of ebanxRoutes) {
        for (let i = 0; i < 140; i++) {
          const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
          const date = randomTimeWithinUTCDate(dayStart);

          let status: TxStatus = TxStatus.APPROVED;
          let error_type: string | undefined = undefined;
          let latency_ms = randInt(600, 1500);

          const r = Math.random();
          if (r < route.approval) {
            status = TxStatus.APPROVED;
          } else if (r < route.approval + 0.15) {
            status = TxStatus.DECLINED;
          } else {
            status = TxStatus.ERROR;
            error_type = 'network';
            latency_ms = randInt(2000, 5000);
          }

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchants[route.merchant].id,
              provider_id: Number((providers[5] as any).id), // Ebanx
              method_id: Number((methods[2] as any).id), // Transferencia
              country_code: route.country,
              status,
              error_type,
              latency_ms,
            }),
          );
        }
      }

      // ESCENARIO 7: PayPal - muy estable en US, variable en LATAM
      const paypalRoutes = [
        { merchant: 0, country: 'US', approval: 0.98, latency: [150, 400] },
        { merchant: 3, country: 'US', approval: 0.97, latency: [160, 420] },
        { merchant: 6, country: 'MX', approval: 0.84, latency: [500, 1200] },
        { merchant: 9, country: 'CO', approval: 0.81, latency: [600, 1400] },
      ];

      for (const route of paypalRoutes) {
        for (let i = 0; i < 170; i++) {
          const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
          const date = randomTimeWithinUTCDate(dayStart);
          const status: TxStatus =
            Math.random() < route.approval ? TxStatus.APPROVED : TxStatus.DECLINED;

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchants[route.merchant].id,
              provider_id: Number((providers[6] as any).id), // PayPal
              method_id: Number((methods[3] as any).id), // Wallet
              country_code: route.country,
              status,
              latency_ms: randInt(route.latency[0], route.latency[1]),
            }),
          );
        }
      }

      // ESCENARIO 8: Kushki - problemas intermitentes
      const kushkiRoutes = [
        { merchant: 4, country: 'PE', approval: 0.76, errorRate: 0.14 },
        { merchant: 8, country: 'CO', approval: 0.73, errorRate: 0.17 },
        { merchant: 11, country: 'MX', approval: 0.79, errorRate: 0.11 },
      ];

      for (const route of kushkiRoutes) {
        for (let i = 0; i < 130; i++) {
          const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
          const date = randomTimeWithinUTCDate(dayStart);

          let status: TxStatus = TxStatus.APPROVED;
          let error_type: string | undefined = undefined;
          let latency_ms = randInt(700, 1800);

          const r = Math.random();
          if (r < route.approval) {
            status = TxStatus.APPROVED;
          } else if (r < route.approval + 0.1) {
            status = TxStatus.DECLINED;
          } else {
            status = TxStatus.ERROR;
            error_type = 'timeout';
            latency_ms = randInt(3000, 7000);
          }

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchants[route.merchant].id,
              provider_id: Number((providers[7] as any).id), // Kushki
              method_id: Number((methods[0] as any).id), // Tarjeta
              country_code: route.country,
              status,
              error_type,
              latency_ms,
            }),
          );
        }
      }

      // ESCENARIO 9: Métodos de pago alternativos
      const alternativeMethodsRoutes = [
        { merchant: 1, provider: 4, method: 4, country: 'MX', approval: 0.90 }, // Efectivo
        { merchant: 5, provider: 4, method: 4, country: 'CO', approval: 0.88 }, // Efectivo
        { merchant: 2, provider: 0, method: 5, country: 'BR', approval: 0.91 }, // Débito
        { merchant: 7, provider: 1, method: 5, country: 'US', approval: 0.94 }, // Débito
      ];

      for (const route of alternativeMethodsRoutes) {
        for (let i = 0; i < 120; i++) {
          const dayStart = pickRandomDayStartUTC(DAYS_BACK_HEALTH);
          const date = randomTimeWithinUTCDate(dayStart);
          const status: TxStatus =
            Math.random() < route.approval ? TxStatus.APPROVED : TxStatus.DECLINED;

          txsToInsert.push(
            makeTx({
              date,
              merchant_id: merchants[route.merchant].id,
              provider_id: Number((providers[route.provider] as any).id),
              method_id: Number((methods[route.method] as any).id),
              country_code: route.country,
              status,
              latency_ms: randInt(300, 900),
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
        summary: {
          total_scenarios: 9,
          merchants_with_data: merchants.length,
          providers_with_data: providers.length,
          countries_with_data: countries.length,
          payment_methods_with_data: methods.length,
          health_scenarios: {
            ok_routes: stripeOkRoutes.length + mercadoPagoRoutes.length + paypalRoutes.length,
            warning_routes: adyenWarningRoutes.length + kushkiRoutes.length,
            critical_routes: dlocalCriticalRoutes.length + ebanxRoutes.length,
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