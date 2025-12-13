export class PaymentMethod {}
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
// Si ya tienes esta entidad, descomenta la relación:
// import { Transaccion } from '../../transacciones/entities/transaccion.entity';

@Entity({ name: 'metodos_pago' })
export class MetodoPago {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'text' })
  nombre: string;

  // UML: MetodosPago "usa" Transacciones (1:N)
  // @OneToMany(() => Transaccion, (tx) => tx.metodo)
  // transacciones: Transaccion[];
}
