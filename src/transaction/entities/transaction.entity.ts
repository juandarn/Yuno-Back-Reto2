// src/transactions/entities/transaction.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Merchant } from '../../merchant/entities/merchant.entity';
import { Provider } from '../../provider/entities/provider.entity';
import { PaymentMethod } from '../../payment-method/entities/payment-method.entity';
import { Country } from '../../country/entities/country.entity';
import { TxStatus, TxErrorType } from '../../common/enums';

@Entity('TRANSACTIONS')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ type: 'uuid' })
  merchant_id: string;

  @Column({ type: 'uuid' })
  provider_id: string;

  @Column({ type: 'uuid' })
  method_id: string;

  @Column({ type: 'char', length: 2 })
  country_code: string;

  @Column({ 
    type: 'text',
    enum: TxStatus
  })
  status: TxStatus; // approved | declined | error | timeout

  @Column({ 
    type: 'text',
    nullable: true
  })
  error_type?: TxErrorType; // provider_down | network | config | timeout

  @Column({ type: 'integer', nullable: true })
  latency_ms?: number;

  // Relations
  @ManyToOne(() => Merchant)
  @JoinColumn({ name: 'merchant_id' })
  merchant: Merchant;

  @ManyToOne(() => Provider)
  @JoinColumn({ name: 'provider_id' })
  provider: Provider;

  @ManyToOne(() => PaymentMethod)
  @JoinColumn({ name: 'method_id' })
  method: PaymentMethod;

  @ManyToOne(() => Country)
  @JoinColumn({ name: 'country_code' })
  country: Country;
}