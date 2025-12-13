import { IsString, IsEnum, IsOptional, IsNumber } from 'class-validator';

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  OPEN = 'open',
  ACK = 'ack',
  RESOLVED = 'resolved',
}

export class CreateAlertDto {
  @IsString()
  metrica_id: string;

  @IsEnum(AlertSeverity)
  severidad: AlertSeverity;

  @IsEnum(AlertStatus)
  @IsOptional()
  estado?: AlertStatus;

  @IsString()
  titulo: string;

  @IsString()
  @IsOptional()
  explicacion?: string;

  @IsString()
  @IsOptional()
  merchant_id?: string;
}

export class UpdateAlertDto {
  @IsEnum(AlertSeverity)
  @IsOptional()
  severidad?: AlertSeverity;

  @IsEnum(AlertStatus)
  @IsOptional()
  estado?: AlertStatus;

  @IsString()
  @IsOptional()
  titulo?: string;

  @IsString()
  @IsOptional()
  explicacion?: string;
}
