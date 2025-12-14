// src/transactions/transactions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';

import { Transaction } from './entities/transaction.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Provider } from '../provider/entities/provider.entity';
import { PaymentMethod } from '../payment-method/entities/payment-method.entity';
import { Country } from '../country/entities/country.entity';
import { FailurePredictionModule } from '../failure-prediction/failure-prediction.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Merchant,
      Provider,
      PaymentMethod,
      Country,
    ]),
    FailurePredictionModule,
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionsModule {}
