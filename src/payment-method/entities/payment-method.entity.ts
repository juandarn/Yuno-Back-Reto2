// src/payment-methods/entities/payment-method.entity.ts
// PLACEHOLDER - This file must be implemented by Federico
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Transaction } from '../../transaction/entities/transaction.entity';

@Entity('PAYMENT_METHODS')
export class PaymentMethod {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  // Relations
  @OneToMany(() => Transaction, transaction => transaction.method)
  transactions: Transaction[];
}