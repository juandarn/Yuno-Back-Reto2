import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource, DeepPartial } from 'typeorm';

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
function pick<T>(arr: T[]) {
  return arr[randInt(0, arr.length - 1)];
}
function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

@Injectable()
export class SeedService {
  constructor(private readonly dataSource: DataSource) { }

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
        // Orden importante por FK: primero hijos, luego padres
        await notifRepo.delete({});
        await alertRepo.delete({});
        await metricRepo.delete({});
        await txRepo.delete({});
        await userRepo.delete({});
        await channelRepo.delete({});
        await merchantRepo.delete({});
        await providerRepo.delete({});
        await methodRepo.delete({});
        await countryRepo.delete({});
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
        { code: 'CL', name: 'Chile' },
        { code: 'AR', name: 'Argentina' },
      ]);

      const methods = await methodRepo.save([
        { name: 'CARD' },
        { name: 'PSE' },
        { name: 'BANK_TRANSFER' },
        { name: 'WALLET' },
      ]);

      const providers = await providerRepo.save([
        { name: 'Stripe' },
        { name: 'Adyen' },
        { name: 'PayU' },
        { name: 'MercadoPago' },
      ]);

      // ------------------------------------------------------------------
      // 2) Merchants
      // ------------------------------------------------------------------
      const merchants = await merchantRepo.save([
        { name: 'ABC Store' },
        { name: 'XYZ E-commerce' },
        { name: '123 Marketplace' },
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
        merchantUsers.push(
          userRepo.create({
            email: `ops@${String(m.name).toLowerCase().replace(/\s+/g, '')}.com`,
            name: `${m.name} Ops`,
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
        {
          name: 'webhook',
          active: true,
          config: { url: 'https://example.com/merchant-webhook', headers: { 'X-Seed': 'true' } },
        },
      ]);

      const emailChannel = channels.find(c => c.name === 'email')!;
      const slackChannel = channels.find(c => c.name === 'slack')!;
      const webhookChannel = channels.find(c => c.name === 'webhook')!;

      // ------------------------------------------------------------------
      // 5) Transactions
      // ------------------------------------------------------------------
      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() - 30);

      const statusWeights = [
        { status: TxStatus.APPROVED, w: 70 },
        { status: TxStatus.DECLINED, w: 18 },
        { status: TxStatus.ERROR, w: 8 },
        { status: TxStatus.TIMEOUT, w: 4 },
      ];
      const errorTypes = ['provider_down', 'network', 'config', 'timeout'];

      function weightedStatus() {
        const total = statusWeights.reduce((s, x) => s + x.w, 0);
        const r = randInt(1, total);
        let acc = 0;
        for (const sw of statusWeights) {
          acc += sw.w;
          if (r <= acc) return sw.status;
        }
        return TxStatus.APPROVED;
      }

      const txsToInsert: Transaction[] = [];
      for (let i = 0; i < 250; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() + randInt(0, 29));
        date.setHours(randInt(0, 23), randInt(0, 59), randInt(0, 59), 0);

        const merchant = pick(merchants);
        const provider = pick(providers);
        const method = pick(methods);
        const country = pick(countries);

        const status = weightedStatus();

        const providerBias =
          String((provider as any).name).toLowerCase().includes('stripe') ? 120 :
            String((provider as any).name).toLowerCase().includes('adyen') ? 160 :
              String((provider as any).name).toLowerCase().includes('payu') ? 220 :
                200;

        let latency = randInt(80, 900) + providerBias;

        let error_type: string | null = null;
        if (status === TxStatus.ERROR) {
          error_type = pick(errorTypes.filter(e => e !== 'timeout'));
          latency += randInt(200, 700);
        }
        if (status === TxStatus.TIMEOUT) {
          error_type = 'timeout';
          latency = randInt(1500, 4000);
        }

        txsToInsert.push(
          txRepo.create({
            date: date.toISOString(),
            merchant_id: merchant.id,
            provider_id: provider.id,
            method_id: method.id,
            country_code: country.code,
            status,
            error_type,
            latency_ms: latency,
          } as DeepPartial<Transaction>),
        );
      }

      const insertedTxs = await txRepo.save(txsToInsert);

      // ------------------------------------------------------------------
      // 6) Metrics + Alerts (ventanas diarias por merchant)
      // ------------------------------------------------------------------
      const TH_ERROR_RATE_WARNING = 0.08;
      const TH_ERROR_RATE_CRIT = 0.15;
      const TH_P95_WARNING = 1200;
      const TH_P95_CRIT = 2000;

      const byDay = new Map<string, Transaction[]>();
      for (const t of insertedTxs) {
        const dayKey = new Date((t as any).date).toISOString().slice(0, 10);
        if (!byDay.has(dayKey)) byDay.set(dayKey, []);
        byDay.get(dayKey)!.push(t);
      }

      const createdAlerts: Alert[] = [];

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
          ] as DeepPartial<Metric>[]);

          const savedMetrics = await metricRepo.save(metrics);

          if (errorRate >= TH_ERROR_RATE_WARNING || p95 >= TH_P95_WARNING) {
            const severity =
              errorRate >= TH_ERROR_RATE_CRIT || p95 >= TH_P95_CRIT ? 'critical' : 'warning';

            const title =
              errorRate >= TH_ERROR_RATE_WARNING
                ? `High error rate for merchant ${m.name}`
                : `High latency (p95) for merchant ${m.name}`;

            const explanation =
              `Window: ${dayKey}\n` +
              `approval_rate=${approvalRate.toFixed(3)} | error_rate=${errorRate.toFixed(3)} | p95_latency=${Math.round(p95)}ms\n` +
              `sample=${mTx.length}`;

            const metricForAlert =
              savedMetrics.find(mt => (mt as any).type === 'error_rate' || (mt as any).tipo === 'error_rate')
              ?? savedMetrics[0];

            const alertEntity = alertRepo.create({
              metric_id: (metricForAlert as any).id,      // ✅ FK NOT NULL
              fecha: end,                                // o end.toISOString() según tu entity
              severidad: severity,                       // 'warning' | 'critical'
              estado: 'open',                            // open|ack|resolved
              titulo: title,
              explicacion: explanation,
              merchant_id: m.id,                         // si tu entidad tiene merchant_id
            } as DeepPartial<Alert>);

            const savedAlert = await alertRepo.save(alertEntity);
            createdAlerts.push(savedAlert);

          }
        }
      }

      // ------------------------------------------------------------------
      // 7) Notifications (por alerta: YUNO + merchant users + canales)
      // ------------------------------------------------------------------
      const allMerchantUsers = await userRepo.find({ where: { type: 'MERCHANT' } as any });
      const allYunoUsers = await userRepo.find({ where: { type: 'YUNO' } as any });

      const notifRows: Notification[] = [];

      for (const alert of createdAlerts) {
        const recipients: User[] = [...allYunoUsers];

        if ((alert as any).merchant_id) {
          recipients.push(
            ...allMerchantUsers.filter(
              u => String((u as any).merchant_id) === String((alert as any).merchant_id),
            ),
          );
        }

        for (const user of recipients) {
          notifRows.push(
            notifRepo.create({
              alert_id: (alert as any).id,
              user_id: (user as any).id,
              channel_id: (emailChannel as any).id,
              sent_at: new Date().toISOString(),
              status: 'pending',
              payload: {
                to: (user as any).email,
                subject: `[${String((alert as any).severity).toUpperCase()}] ${(alert as any).title}`,
                body: (alert as any).explanation,
              },
            } as DeepPartial<Notification>),
          );

          notifRows.push(
            notifRepo.create({
              alert_id: (alert as any).id,
              user_id: (user as any).id,
              channel_id: (slackChannel as any).id,
              sent_at: new Date().toISOString(),
              status: 'pending',
              payload: {
                text: `*${String((alert as any).severity).toUpperCase()}* - ${(alert as any).title}\n${(alert as any).explanation}`,
              },
            } as DeepPartial<Notification>),
          );

          if ((user as any).type === 'MERCHANT') {
            notifRows.push(
              notifRepo.create({
                alert_id: (alert as any).id,
                user_id: (user as any).id,
                channel_id: (webhookChannel as any).id,
                sent_at: new Date().toISOString(),
                status: 'pending',
                payload: {
                  merchant_id: (alert as any).merchant_id,
                  event: 'ALERT_CREATED',
                  severity: (alert as any).severity,
                  title: (alert as any).title,
                  explanation: (alert as any).explanation,
                },
              } as DeepPartial<Notification>),
            );
          }
        }
      }

      if (notifRows.length) await notifRepo.save(notifRows);

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
          // metrics: (no exact count returned here, but you can count if quieres)
          alerts: createdAlerts.length,
          notifications: notifRows.length,
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
