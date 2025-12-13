import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from './entities/payment-method.entity';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
  ) {}

  /**
   * Create a new payment method
   */
  async create(
    createPaymentMethodDto: CreatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const paymentMethod = this.paymentMethodRepository.create(
      createPaymentMethodDto,
    );
    return await this.paymentMethodRepository.save(paymentMethod);
  }

  /**
   * Get all payment methods
   */
  async findAll(): Promise<PaymentMethod[]> {
    return await this.paymentMethodRepository.find({
      order: { name: 'ASC' },
    });
  }

  /**
   * Get a payment method by ID
   */
  async findOne(id: string): Promise<PaymentMethod> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id },
    });

    if (!paymentMethod) {
      throw new NotFoundException(`Payment method with ID ${id} not found`);
    }

    return paymentMethod;
  }

  /**
   * Update a payment method
   */
  async update(
    id: string,
    updatePaymentMethodDto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethod> {
    const paymentMethod = await this.findOne(id);

    Object.assign(paymentMethod, updatePaymentMethodDto);

    return await this.paymentMethodRepository.save(paymentMethod);
  }

  /**
   * Delete a payment method
   */
  async remove(id: string): Promise<void> {
    const paymentMethod = await this.findOne(id);
    await this.paymentMethodRepository.remove(paymentMethod);
  }

  /**
   * Check if a payment method exists by name
   */
  async existsByName(nombre: string): Promise<boolean> {
    const count = await this.paymentMethodRepository.count({
      where: { name: nombre },
    });
    return count > 0;
  }
}
