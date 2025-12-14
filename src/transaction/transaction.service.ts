import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TxStatus } from '../common/enums';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
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
}
