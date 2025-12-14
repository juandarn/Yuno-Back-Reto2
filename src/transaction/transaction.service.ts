import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TxStatus } from '../common/enums';
import { Merchant } from '../merchant/entities/merchant.entity';
import { Provider } from '../provider/entities/provider.entity';
import { PaymentMethod } from '../payment-method/entities/payment-method.entity';
import { Country } from '../country/entities/country.entity';
import { FailurePredictionService } from '../failure-prediction/failure-prediction.service';
import { FailureProbability } from '../failure-prediction/dto/failure-prediction.dto';
import { TxErrorType } from '../common/enums';
import type {
  OptionsTreeResponse,
  OptionsRow,
  MerchantBucket,
  ProviderBucket,
  MethodBucket,
  MerchantOption,
  CountryOption,
} from './dto/transaction-options-tree.dto';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(Merchant) private merchantRepo: Repository<Merchant>,
    @InjectRepository(Provider) private providerRepo: Repository<Provider>,
    @InjectRepository(PaymentMethod)
    private methodRepo: Repository<PaymentMethod>,
    @InjectRepository(Country) private countryRepo: Repository<Country>,
    private readonly failurePredictionService: FailurePredictionService,
  ) {}

  async create(
    createTransactionDto: CreateTransactionDto,
  ): Promise<Transaction> {
    const transaction = this.transactionsRepository.create({
      ...createTransactionDto,
      date: new Date(createTransactionDto.date),
    });
    return this.transactionsRepository.save(transaction);
  }

  async findAll(): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      relations: ['merchant', 'provider', 'method', 'country'],
      order: { date: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { id },
      relations: ['merchant', 'provider', 'method', 'country'],
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    return transaction;
  }

  async findByMerchant(merchantId: string): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: { merchant_id: merchantId },
      relations: ['merchant', 'provider', 'method', 'country'],
      order: { date: 'DESC' },
    });
  }

  async findByProvider(providerId: string): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: { provider_id: providerId },
      relations: ['merchant', 'provider', 'method', 'country'],
      order: { date: 'DESC' },
    });
  }

  async findByStatus(status: TxStatus): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: { status },
      relations: ['merchant', 'provider', 'method', 'country'],
      order: { date: 'DESC' },
    });
  }

  async findByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<Transaction[]> {
    return this.transactionsRepository.find({
      where: {
        date: Between(startDate, endDate),
      },
      relations: ['merchant', 'provider', 'method', 'country'],
      order: { date: 'DESC' },
    });
  }

  async update(
    id: string,
    updateTransactionDto: UpdateTransactionDto,
  ): Promise<Transaction> {
    const transaction = await this.findOne(id);

    if (updateTransactionDto.date) {
      updateTransactionDto.date = new Date(updateTransactionDto.date) as any;
    }

    Object.assign(transaction, updateTransactionDto);
    return this.transactionsRepository.save(transaction);
  }

  async remove(id: string): Promise<void> {
    const transaction = await this.findOne(id);
    await this.transactionsRepository.remove(transaction);
  }

  // Analysis methods
  async getStatsByMerchant(
    merchantId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('tx')
      .where('tx.merchant_id = :merchantId', { merchantId });

    if (startDate && endDate) {
      queryBuilder.andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const transactions = await queryBuilder.getMany();

    const total = transactions.length;
    const approved = transactions.filter(
      (tx) => tx.status === TxStatus.APPROVED,
    ).length;
    const declined = transactions.filter(
      (tx) => tx.status === TxStatus.DECLINED,
    ).length;
    const errors = transactions.filter(
      (tx) => tx.status === TxStatus.ERROR,
    ).length;
    const timeouts = transactions.filter(
      (tx) => tx.status === TxStatus.TIMEOUT,
    ).length;

    const avgLatency =
      transactions
        .filter((tx) => tx.latency_ms)
        .reduce((sum, tx) => sum + (tx.latency_ms || 0), 0) /
      (transactions.filter((tx) => tx.latency_ms).length || 1);

    return {
      merchantId,
      period: { startDate, endDate },
      total,
      approved,
      declined,
      errors,
      timeouts,
      approvalRate: total > 0 ? (approved / total) * 100 : 0,
      avgLatencyMs: Math.round(avgLatency),
    };
  }

  async getStatsByProvider(
    providerId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('tx')
      .where('tx.provider_id = :providerId', { providerId });

    if (startDate && endDate) {
      queryBuilder.andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const transactions = await queryBuilder.getMany();

    const total = transactions.length;
    const approved = transactions.filter(
      (tx) => tx.status === TxStatus.APPROVED,
    ).length;
    const errors = transactions.filter(
      (tx) => tx.status === TxStatus.ERROR,
    ).length;

    return {
      providerId,
      period: { startDate, endDate },
      total,
      approved,
      errors,
      errorRate: total > 0 ? (errors / total) * 100 : 0,
    };
  }

  // NEW METHODS: Find transactions by last X days
  async findByMerchantLastDays(
    merchantId: string,
    days: number,
  ): Promise<Transaction[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.transactionsRepository.find({
      where: {
        merchant_id: merchantId,
        date: Between(startDate, endDate),
      },
      relations: ['merchant', 'provider', 'method', 'country'],
      order: { date: 'DESC' },
    });
  }

  async findByProviderLastDays(
    providerId: string,
    days: number,
  ): Promise<Transaction[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.transactionsRepository.find({
      where: {
        provider_id: providerId,
        date: Between(startDate, endDate),
      },
      relations: ['merchant', 'provider', 'method', 'country'],
      order: { date: 'DESC' },
    });
  }

  async findByPaymentMethodLastDays(
    methodId: string,
    days: number,
  ): Promise<Transaction[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.transactionsRepository.find({
      where: {
        method_id: methodId,
        date: Between(startDate, endDate),
      },
      relations: ['merchant', 'provider', 'method', 'country'],
      order: { date: 'DESC' },
    });
  }

  async getStatsByPaymentMethod(
    methodId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('tx')
      .where('tx.method_id = :methodId', { methodId });

    if (startDate && endDate) {
      queryBuilder.andWhere('tx.date BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const transactions = await queryBuilder.getMany();

    const total = transactions.length;
    const approved = transactions.filter(
      (tx) => tx.status === TxStatus.APPROVED,
    ).length;
    const declined = transactions.filter(
      (tx) => tx.status === TxStatus.DECLINED,
    ).length;
    const errors = transactions.filter(
      (tx) => tx.status === TxStatus.ERROR,
    ).length;
    const timeouts = transactions.filter(
      (tx) => tx.status === TxStatus.TIMEOUT,
    ).length;

    const avgLatency =
      transactions
        .filter((tx) => tx.latency_ms)
        .reduce((sum, tx) => sum + (tx.latency_ms || 0), 0) /
      (transactions.filter((tx) => tx.latency_ms).length || 1);

    return {
      methodId,
      period: { startDate, endDate },
      total,
      approved,
      declined,
      errors,
      timeouts,
      approvalRate: total > 0 ? (approved / total) * 100 : 0,
      avgLatencyMs: Math.round(avgLatency),
    };
  }
  private buildApprovedAggQuery(params: {
    merchant_id: string;
    provider_id?: number;
    method_id?: number;
    country_code?: string;
    start: Date;
    end: Date;
  }) {
    const qb = this.transactionsRepository
      .createQueryBuilder('tx')
      .select(`date_trunc('day', tx.date)`, 'day')
      .addSelect(`COUNT(*)`, 'approved')
      .where('tx.status = :status', { status: TxStatus.APPROVED })
      .andWhere('tx.merchant_id = :merchant_id', {
        merchant_id: params.merchant_id,
      })
      .andWhere('tx.date >= :start AND tx.date < :end', {
        start: params.start,
        end: params.end,
      });

    if (params.provider_id !== undefined) {
      qb.andWhere('tx.provider_id = :provider_id', {
        provider_id: params.provider_id,
      });
    }

    if (params.method_id !== undefined) {
      qb.andWhere('tx.method_id = :method_id', { method_id: params.method_id });
    }

    if (params.country_code) {
      qb.andWhere('tx.country_code = :country_code', {
        country_code: params.country_code,
      });
    }

    return qb.groupBy('day').orderBy('day', 'ASC');
  }

  private async getApprovedDailySeries(params: {
    merchant_id: string;
    provider_id?: number;
    method_id?: number;
    country_code?: string;
    start: Date;
    end: Date;
  }): Promise<Map<string, number>> {
    const rows = await this.buildApprovedAggQuery(params).getRawMany();

    const map = new Map<string, number>();
    for (const r of rows) {
      const day = new Date(r.day).toISOString().slice(0, 10); // YYYY-MM-DD
      map.set(day, Number(r.approved));
    }
    return map;
  }

  private startOfDayUTC(d: Date) {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
  }

  private addDaysUTC(d: Date, days: number) {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + days);
    return x;
  }
  
  async getApprovedExpectedVsActual(params: {
    merchant_id: string;
    provider_id?: number;
    method_id?: number;
    country_code?: string;
  }): Promise<{
    filters: any;
    range: { from: string; to: string };
    weeks_history: number;
    series: Array<{ date: string; actual: number; expected: number }>;
    risk_analysis?: FailureProbability | null;
  }> {
    const weeksHistory = 1;

    const todayStart = this.startOfDayUTC(new Date());
    const from = this.addDaysUTC(todayStart, -6);
    const to = this.addDaysUTC(todayStart, 1);

    const prevFrom = this.addDaysUTC(from, -7);
    const prevTo = this.addDaysUTC(to, -7);

    const fullMap = await this.getApprovedDailySeries({
      merchant_id: params.merchant_id,
      provider_id: params.provider_id,
      method_id: params.method_id,
      country_code: params.country_code,
      start: prevFrom,
      end: to, // Fetches from prevFrom to to (exclusive) covers both weeks
    });

    const series: Array<{ date: string; actual: number; expected: number }> =
      [];
    const cursor = new Date(from);

    while (cursor < to) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const prevDateStr = this.addDaysUTC(cursor, -7)
        .toISOString()
        .slice(0, 10);

      series.push({
        date: dateStr,
        actual: fullMap.get(dateStr) ?? 0,
        expected: fullMap.get(prevDateStr) ?? 0,
      });

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const failurePrediction = await this.failurePredictionService.getPredictions({
      merchant_id: params.merchant_id,
      provider_id: params.provider_id?.toString(),
      method_id: params.method_id?.toString(),
      country_code: params.country_code,
      time_window_minutes: 60,
      include_low_risk: true,
    });

    // Encontrar la predicción más relevante (mayor riesgo)
    const riskAnalysis = failurePrediction.predictions.length > 0 
      ? failurePrediction.predictions[0] 
      : null;

    return {
      filters: {
        merchant_id: params.merchant_id,
        provider_id: params.provider_id,
        method_id: params.method_id,
        country_code: params.country_code,
      },
      range: { from: from.toISOString(), to: to.toISOString() },
      weeks_history: weeksHistory,
      series,
      risk_analysis: riskAnalysis,
    };
  }

  async getTransactionOptionsTree(): Promise<OptionsTreeResponse> {
    const rows = await this.transactionsRepository
      .createQueryBuilder('tx')
      .innerJoin('tx.merchant', 'm')
      .innerJoin('tx.provider', 'p')
      .innerJoin('tx.method', 'pm')
      .innerJoin('tx.country', 'c')
      .select([
        'm.id AS merchant_id',
        'm.name AS merchant_name',
        'p.id AS provider_id',
        'p.name AS provider_name',
        'pm.id AS method_id',
        'pm.name AS method_name',
        'c.code AS country_code',
        'c.name AS country_name',
      ])
      .distinct(true)
      .getRawMany<OptionsRow>();

    const merchantMap = new Map<string, MerchantBucket>();

    for (const r of rows) {
      const mid = r.merchant_id;
      const pid = Number(r.provider_id);
      const methodId = Number(r.method_id);
      const cc = r.country_code;

      let merchant = merchantMap.get(mid);
      if (!merchant) {
        merchant = {
          id: mid,
          name: r.merchant_name,
          providers: new Map<number, ProviderBucket>(),
        };
        merchantMap.set(mid, merchant);
      }

      let provider = merchant.providers.get(pid);
      if (!provider) {
        provider = {
          id: pid,
          name: r.provider_name,
          methods: new Map<number, MethodBucket>(),
        };
        merchant.providers.set(pid, provider);
      }

      let method = provider.methods.get(methodId);
      if (!method) {
        method = {
          id: methodId,
          name: r.method_name,
          countries: new Map<string, CountryOption>(),
        };
        provider.methods.set(methodId, method);
      }

      if (!method.countries.has(cc)) {
        method.countries.set(cc, { code: cc, name: r.country_name });
      }
    }

    // OJO: aquí es donde te estaba saliendo unknown, por no tipar Map values
    const merchants: MerchantOption[] = Array.from(merchantMap.values()).map(
      (m: MerchantBucket) => ({
        id: m.id,
        name: m.name,
        providers: Array.from(m.providers.values()).map(
          (p: ProviderBucket) => ({
            id: p.id,
            name: p.name,
            methods: Array.from(p.methods.values()).map((mm: MethodBucket) => ({
              id: mm.id,
              name: mm.name,
              countries: Array.from(mm.countries.values()),
            })),
          }),
        ),
      }),
    );

    return { merchants };
  }
}
