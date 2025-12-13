import { Transaction } from '../../transaction/entities/transaction.entity';

import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
// Si ya tienes esta entidad, descomenta la relación:
// import { Transaccion } from '../../transacciones/entities/transaccion.entity';

@Entity({ name: 'metodos_pago' })
export class PaymentMethod {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  // Relations
  @OneToMany(() => Transaction, transaction => transaction.method)
  transactions: Transaction[];
}
