import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Alert } from '../../alert/entities/alert.entity';
import { NotificationChannel } from '../../notification-channel/entities/notification-channel.entity';
import { User } from '../../user/entities/user.entity';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  alert_id: string;

  @ManyToOne(() => Alert, (alert) => alert.notifications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'alert_id' })
  alert: Alert;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid' })
  channel_id: string;

  @ManyToOne(() => NotificationChannel, (channel) => channel.notifications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'channel_id' })
  channel: NotificationChannel;

  @CreateDateColumn({ type: 'timestamp' })
  enviado_en: Date;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  estado: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: any;

  @ManyToOne(() => User, (user) => user.notifications, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
