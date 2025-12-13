import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthGraphController } from './health-graph.controller';
import { HealthGraphService } from './health-graph.service';
import { Metric } from '../metric/entities/metric.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Provider } from '../provider/entities/provider.entity';
import { PaymentMethod } from '../payment-method/entities/payment-method.entity';
import { Country } from '../country/entities/country.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Metric,
      Transaction,
      Merchant,
      Provider,
      PaymentMethod,
      Country,
    ]),
  ],
  controllers: [HealthGraphController],
  providers: [HealthGraphService],
  exports: [HealthGraphService],
})
export class HealthGraphModule {}
