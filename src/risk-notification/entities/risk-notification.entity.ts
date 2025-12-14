import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('risk_notifications')
export class RiskNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Identificador de la entidad en riesgo
  @Column({ type: 'varchar' })
  entity_type: string; // 'merchant' | 'provider' | 'method' | 'country' | 'route'

  @Column({ type: 'varchar' })
  entity_id: string;

  @Column({ type: 'varchar' })
  entity_name: string;

  // Nivel de riesgo cuando se notificó
  @Column({ type: 'varchar' })
  risk_level: string; // 'medium' | 'high' | 'critical'

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  probability: number;

  // Estado de la notificación
  @Column({ type: 'varchar', default: 'guard_notified' })
  status: string; // 'guard_notified' | 'escalated' | 'dismissed' | 'resolved'

  // Intentos de notificación al guardia
  @Column({ type: 'int', default: 0 })
  guard_attempts: number;

  @Column({ type: 'timestamp', nullable: true })
  last_guard_notification: Date;

  // Usuario guardia asignado
  @Column({ type: 'bigint', nullable: true })
  guard_user_id: string;

  // Si se escaló a todos
  @Column({ type: 'boolean', default: false })
  escalated_to_all: boolean;

  @Column({ type: 'timestamp', nullable: true })
  escalated_at: Date;

  // Si el guardia descartó la alerta
  @Column({ type: 'boolean', default: false })
  dismissed_by_guard: boolean;

  @Column({ type: 'bigint', nullable: true })
  dismissed_by_user_id: string;

  @Column({ type: 'timestamp', nullable: true })
  dismissed_at: Date;

  @Column({ type: 'text', nullable: true })
  dismissal_reason: string;

  // Si el problema se resolvió
  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  @Column({ type: 'timestamp', nullable: true })
  resolved_at: Date;

  // Metadata adicional
  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;
}