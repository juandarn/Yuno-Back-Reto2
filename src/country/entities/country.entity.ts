import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { Transaction } from '../../transaction/entities/transaction.entity';

export class Country {
  @PrimaryColumn({ type: 'char', length: 2 })
  code: string;

  @Column({ type: 'text' })
  name: string;

  @OneToMany(() => Transaction, (transaction) => transaction.country)
  transactions: Transaction[];
}
