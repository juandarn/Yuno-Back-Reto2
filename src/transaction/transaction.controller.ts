// src/transactions/transactions.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TxStatus } from '../common/enums';

@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createTransactionDto: CreateTransactionDto) {
    return this.transactionService.create(createTransactionDto);
  }

  @Get()
  findAll(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (startDate && endDate) {
      return this.transactionService.findByDateRange(
        new Date(startDate),
        new Date(endDate),
      );
    }
    return this.transactionService.findAll();
  }

  @Get('merchant/:merchantId')
  findByMerchant(@Param('merchantId') merchantId: string) {
    return this.transactionService.findByMerchant(merchantId);
  }

  @Get('provider/:providerId')
  findByProvider(@Param('providerId') providerId: string) {
    return this.transactionService.findByProvider(providerId);
  }

  @Get('status/:status')
  findByStatus(@Param('status') status: TxStatus) {
    return this.transactionService.findByStatus(status);
  }

  @Get('stats/merchant/:merchantId')
  getStatsByMerchant(
    @Param('merchantId') merchantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.transactionService.getStatsByMerchant(
      merchantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('stats/provider/:providerId')
  getStatsByProvider(
    @Param('providerId') providerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.transactionService.getStatsByProvider(
      providerId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTransactionDto: UpdateTransactionDto) {
    return this.transactionService.update(id, updateTransactionDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.transactionService.remove(id);
  }
}