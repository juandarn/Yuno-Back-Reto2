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
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TxStatus } from '../common/enums';
import { ApprovedForecastQueryDto } from './dto/approved-forecast.query.dto';

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

  @Get('approved-forecast')
  approvedForecast(@Query() q: ApprovedForecastQueryDto) {
    return this.transactionService.getApprovedExpectedVsActual({
      merchant_id: q.merchant_id,
      provider_id: q.provider_id,
      method_id: q.method_id,
      country_code: q.country_code,
    });
  }

  @Get('options-tree')
  getOptionsTree() {
    return this.transactionService.getTransactionOptionsTree();
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

  // NEW ENDPOINTS: Get transactions by last X days
  @Get('merchant/:merchantId/last-days')
  findByMerchantLastDays(
    @Param('merchantId') merchantId: string,
    @Query('days', ParseIntPipe) days: number,
  ) {
    if (days <= 0) {
      throw new BadRequestException('Days must be a positive number');
    }
    return this.transactionService.findByMerchantLastDays(merchantId, days);
  }

  @Get('provider/:providerId/last-days')
  findByProviderLastDays(
    @Param('providerId') providerId: string,
    @Query('days', ParseIntPipe) days: number,
  ) {
    if (days <= 0) {
      throw new BadRequestException('Days must be a positive number');
    }
    return this.transactionService.findByProviderLastDays(providerId, days);
  }

  @Get('payment-method/:methodId/last-days')
  findByPaymentMethodLastDays(
    @Param('methodId') methodId: string,
    @Query('days', ParseIntPipe) days: number,
  ) {
    if (days <= 0) {
      throw new BadRequestException('Days must be a positive number');
    }
    return this.transactionService.findByPaymentMethodLastDays(methodId, days);
  }

  // Stats endpoints
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

  @Get('stats/payment-method/:methodId')
  getStatsByPaymentMethod(
    @Param('methodId') methodId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.transactionService.getStatsByPaymentMethod(
      methodId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTransactionDto: UpdateTransactionDto,
  ) {
    return this.transactionService.update(id, updateTransactionDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.transactionService.remove(id);
  }
}
