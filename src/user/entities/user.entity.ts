// src/users/entities/user.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Merchant } from '../../merchant/entities/merchant.entity';
import { Notification } from '../../notification/entities/notification.entity';

@Entity('USERS')
export class User {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text' })
  number: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  type: string; // YUNO | MERCHANT

  @Column({ type: 'bigint', nullable: true })
  merchant_id: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  // Relations
  @ManyToOne(() => Merchant, { nullable: true })
  @JoinColumn({ name: 'merchant_id' })
  merchant: Merchant;

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[];
}
