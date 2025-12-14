import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FailurePredictionController } from './failure-prediction.controller';
import { FailurePredictionService } from './failure-prediction.service';
import { Transaction } from '../transaction/entities/transaction.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Provider } from '../provider/entities/provider.entity';
import { PaymentMethod } from '../payment-method/entities/payment-method.entity';
import { Country } from '../country/entities/country.entity';
import { AlertModule } from '../alert/alert.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Merchant,
      Provider,
      PaymentMethod,
      Country,
    ]),
    AlertModule,
  ],
  controllers: [FailurePredictionController],
  providers: [FailurePredictionService],
  exports: [FailurePredictionService],
})
export class FailurePredictionModule {}
