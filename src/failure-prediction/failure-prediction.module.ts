import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { FailurePredictionController } from './failure-prediction.controller';
import { FailurePredictionService } from './failure-prediction.service';
import { RiskNotificationService } from '../risk-notification/risk-notification.service';
import { RiskNotificationController } from '../risk-notification/risk-notification.controller';
import { Transaction } from '../transaction/entities/transaction.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Provider } from '../provider/entities/provider.entity';
import { PaymentMethod } from '../payment-method/entities/payment-method.entity';
import { Country } from '../country/entities/country.entity';
import { RiskNotification } from '../risk-notification/entities/risk-notification.entity';
import { User } from '../user/entities/user.entity';
import { NotificationChannel } from '../notification-channel/entities/notification-channel.entity';
import { AlertModule } from '../alert/alert.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Merchant,
      Provider,
      PaymentMethod,
      Country,
      RiskNotification,
      User,
      NotificationChannel,
    ]),
    ScheduleModule.forRoot(), // Habilita cron jobs
    AlertModule,
    NotificationModule,
  ],
  controllers: [
    FailurePredictionController,
    RiskNotificationController,
  ],
  providers: [
    FailurePredictionService,
    RiskNotificationService,
  ],
  exports: [
    FailurePredictionService,
    RiskNotificationService,
  ],
})
export class FailurePredictionModule {}