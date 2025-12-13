import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Notification } from '../../notification/entities/notification.entity';

@Entity('canales_notificacion')
export class NotificationChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  nombre: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  slack: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  webhook: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ type: 'jsonb', nullable: true })
  config: any;

  @OneToMany(() => Notification, notification => notification.channel)
  notifications: Notification[];
}
