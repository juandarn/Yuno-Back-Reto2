import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'usuario',
      password: 'usuario',
      database: 'yuno',
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
      synchronize: true,
    }),
    PaymentMethodModule,
    ProvidersModule,
    CountryModule,
    MerchantsModule,
    UsersModule,
    TransactionsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
