import { Module } from '@nestjs/common';
import { PaymentMethodsService } from './payment-method.service';
import { PaymentMethodsController } from './payment-method.controller';

@Module({
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService],
  exports: [PaymentMethodsService],
})
export class PaymentMethodModule {}
