// src/merchant/merchant.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantsService } from './merchant.service';
import { MerchantsController } from './merchant.controller';
import { Merchant } from './entities/merchant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant])],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}