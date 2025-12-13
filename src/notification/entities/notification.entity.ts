import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Alert } from '../../alert/entities/alert.entity';
import { NotificationChannel } from '../../notification-channel/entities/notification-channel.entity';

@Entity('notificaciones')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  alerta_id: string;

  @ManyToOne(() => Alert, alert => alert.notifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alerta_id' })
  alert: Alert;

  @Column({ type: 'uuid' })
  usuario_id: string;

  @Column({ type: 'uuid' })
  canal_id: string;

  @ManyToOne(() => NotificationChannel, channel => channel.notifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'canal_id' })
  channel: NotificationChannel;

  @CreateDateColumn({ type: 'timestamp' })
  enviado_en: Date;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  estado: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: any;
}
