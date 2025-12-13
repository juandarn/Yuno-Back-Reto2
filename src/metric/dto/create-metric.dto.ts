import { IsString, IsEnum, IsOptional, IsNumber } from 'class-validator';

export enum MetricType {
  TIPO = 'tipo',
  INICIO_VENTANA = 'inicio_ventana',
  FIN_VENTANA = 'fin_ventana',
}

export class CreateMetricDto {
  @IsString()
  tipo: string;

  @IsNumber()
  @IsOptional()
  valor?: number;

  @IsString()
  @IsOptional()
  muestra?: string;

  @IsNumber()
  @IsOptional()
  score_anomalia?: number;

  @IsString()
  @IsOptional()
  merchant_id?: string;

  @IsString()
  @IsOptional()
  provider_id?: string;

  @IsString()
  @IsOptional()
  metodo_id?: string;

  @IsString()
  @IsOptional()
  pais_codigo?: string;

  @IsNumber()
  @IsOptional()
  approval_rate?: number;

  @IsNumber()
  @IsOptional()
  error_rate?: number;

  @IsNumber()
  @IsOptional()
  p95_latency?: number;
}
