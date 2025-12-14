import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentMethodModule } from './payment-method/payment-method.module';
import { ProvidersModule } from './provider/providers.module';
import { CountryModule } from './country/country.module';
import { MerchantsModule } from './merchant/merchant.module';
import { UsersModule } from './user/user.module';
import { TransactionsModule } from './transaction/transaction.module';

import { Alert } from './alert/entities/alert.entity';
import { Country } from './country/entities/country.entity';
import { Merchant } from './merchant/entities/merchant.entity';
import { Metric } from './metric/entities/metric.entity';
import { NotificationChannel } from './notification-channel/entities/notification-channel.entity';
import { User } from './user/entities/user.entity';
import { PaymentMethod } from './payment-method/entities/payment-method.entity';
import { Transaction } from './transaction/entities/transaction.entity';
import { Provider } from './provider/entities/provider.entity';
import { Notification } from './notification/entities/notification.entity';
import { SeedModule } from './seed/seed.module';
import { HealthGraphModule } from './health-graph/health-graph.module';
import { AlertModule } from './alert/alert.module';
import { NotificationModule } from './notification/notification.module';
import { NotificationChannelModule } from './notification-channel/notification-channel.module';
import { MetricModule } from './metric/metric.module';
import { FailurePredictionModule } from './failure-prediction/failure-prediction.module';
import { OnCallModule } from './on-call/on-call.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const toBool = (v?: string, def = false) =>
          (v ?? String(def)).toLowerCase() === 'true';

        const isProd = (process.env.APP_STAGE || '').toLowerCase() === 'prod';

        return {
          type: (process.env.DATABASE_TYPE as any) || 'postgres',
          host: process.env.DATABASE_HOST,
          port: Number(process.env.DATABASE_PORT || 5432),
          username: process.env.DATABASE_USERNAME,
          password: process.env.DATABASE_PASSWORD,
          database: process.env.DATABASE_DB_NAME,
          autoLoadEntities: toBool(
            process.env.DATABASE_DB_AUTO_LOAD_ENTITIES,
            true,
          ),
          entities: [
            Alert,
            Country,
            Merchant,
            Metric,
            Notification,
            NotificationChannel,
            User,
            Transaction,
            PaymentMethod,
            Provider,
          ],

          synchronize: toBool(process.env.DATABASE_DB_SYNC, !isProd),
          ssl: toBool(process.env.DATABASE_SSL, isProd)
            ? { rejectUnauthorized: false }
            : false,
        };
      },
    }),

    PaymentMethodModule,
    ProvidersModule,
    CountryModule,
    MerchantsModule,
    UsersModule,
    TransactionsModule,
    SeedModule,
    HealthGraphModule,
    AlertModule,
    NotificationModule,
    NotificationChannelModule,
    MetricModule,
    FailurePredictionModule,
    OnCallModule,
  ],
})
export class AppModule {}
