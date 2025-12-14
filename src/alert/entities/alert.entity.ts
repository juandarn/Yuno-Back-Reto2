import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Metric } from '../../metric/entities/metric.entity';
import { Notification } from '../../notification/entities/notification.entity';
import { Merchant } from '../../merchant/entities/merchant.entity';

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })  // ✅ CAMBIO: Ahora es nullable
  metric_id?: string;  // ✅ CAMBIO: Ahora es opcional

  @ManyToOne(() => Metric, (metric) => metric.alerts, { onDelete: 'CASCADE', nullable: true })  // ✅ CAMBIO: nullable
  @JoinColumn({ name: 'metric_id' })
  metric?: Metric;  // ✅ CAMBIO: Ahora es opcional

  @CreateDateColumn({ type: 'timestamp' })
  fecha: Date;

  @Column({ type: 'varchar', length: 50 })
  severity: string;

  @Column({ type: 'varchar', length: 50, default: 'open' })
  estado: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  explanation: string;

  @Column({ type: 'uuid', nullable: true })
  merchant_id: string;

  @OneToMany(() => Notification, (notification) => notification.alert)
  notifications: Notification[];

  @ManyToOne(() => Merchant, (merchant) => merchant.alerts, { nullable: true })
  @JoinColumn({ name: 'merchant_id' })
  merchant?: Merchant;
}