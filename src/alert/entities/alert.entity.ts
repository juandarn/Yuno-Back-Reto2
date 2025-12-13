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

@Entity('alertas')
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  metrica_id: string;

  @ManyToOne(() => Metric, (metric) => metric.alerts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'metrica_id' })
  metric: Metric;

  @CreateDateColumn({ type: 'timestamp' })
  fecha: Date;

  @Column({ type: 'varchar', length: 50 })
  severidad: string;

  @Column({ type: 'varchar', length: 50, default: 'open' })
  estado: string;

  @Column({ type: 'varchar', length: 255 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  explicacion: string;

  @Column({ type: 'uuid', nullable: true })
  merchant_id: string;

  @OneToMany(() => Notification, (notification) => notification.alert)
  notifications: Notification[];

  @ManyToOne(() => Merchant, (merchant) => merchant.alerts, { nullable: true })
  @JoinColumn({ name: 'merchant_id' })
  merchant?: Merchant;
}
