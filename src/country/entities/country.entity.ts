import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';

@Entity({ name: 'paises' })
export class Pais {
  @PrimaryColumn({ type: 'char', length: 2 })
  codigo: string; // ej: "CO", "MX"

  @Column({ type: 'text' })
  nombre: string;
}

