// src/merchants/entities/merchant.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Transaction } from '../../transaction/entities/transaction.entity';
import { Alert } from '../../alert/entities/alert.entity';

@Entity('MERCHANTS')
export class Merchant {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  // Relations
  @OneToMany(() => User, user => user.merchant)
  users: User[];

  @OneToMany(() => Transaction, transaction => transaction.merchant)
  transactions: Transaction[];

  @OneToMany(() => Alert, alert => alert.merchant)
  alerts: Alert[];
}