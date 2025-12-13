// src/merchants/merchants.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from './entities/merchant.entity';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

@Injectable()
export class MerchantsService {
  constructor(
    @InjectRepository(Merchant)
    private merchantsRepository: Repository<Merchant>,
  ) {}

  async create(createMerchantDto: CreateMerchantDto): Promise<Merchant> {
    const merchant = this.merchantsRepository.create(createMerchantDto);
    return this.merchantsRepository.save(merchant);
  }

  async findAll(): Promise<Merchant[]> {
    return this.merchantsRepository.find({
      relations: ['users', 'transactions'],
    });
  }

  async findOne(id: string): Promise<Merchant> {
    const merchant = await this.merchantsRepository.findOne({
      where: { id },
      relations: ['users', 'transactions', 'alerts'],
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found`);
    }

    return merchant;
  }

  async update(id: string, updateMerchantDto: UpdateMerchantDto): Promise<Merchant> {
    const merchant = await this.findOne(id);
    Object.assign(merchant, updateMerchantDto);
    return this.merchantsRepository.save(merchant);
  }

  async remove(id: string): Promise<void> {
    const merchant = await this.findOne(id);
    await this.merchantsRepository.remove(merchant);
  }

  async getStats(id: string): Promise<any> {
    const merchant = await this.findOne(id);
    
    // Here you can add specific statistics
    const totalTransactions = merchant.transactions?.length || 0;
    const totalUsers = merchant.users?.length || 0;
    
    return {
      merchantId: id,
      name: merchant.name,
      totalTransactions,
      totalUsers,
    };
  }
}