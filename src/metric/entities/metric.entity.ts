import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Alert } from '../../alert/entities/alert.entity';

@Entity('metricas')
export class Metric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tipo: string;

  @CreateDateColumn({ type: 'timestamp' })
  timestamptz: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  valor: number;

  @Column({ type: 'text', nullable: true })
  muestra: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  score_anomalia: number;

  @Column({ type: 'uuid', nullable: true })
  merchant_id: string;

  @Column({ type: 'uuid', nullable: true })
  provider_id: string;

  @Column({ type: 'uuid', nullable: true })
  metodo_id: string;

  @Column({ type: 'char', length: 2, nullable: true })
  pais_codigo: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  approval_rate: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  error_rate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  p95_latency: number;

  @OneToMany(() => Alert, alert => alert.metric)
  alerts: Alert[];
}
