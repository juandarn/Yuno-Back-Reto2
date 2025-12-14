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
  @IsOptional()  // ← AGREGAR ESTA LÍNEA
  metric_id?: string;  // ← AGREGAR ? para hacerlo opcional

  @IsEnum(AlertSeverity)
  severity: AlertSeverity;

  @IsEnum(AlertStatus)
  @IsOptional()
  state?: AlertStatus;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  explanation?: string;

  @IsString()
  @IsOptional()
  merchant_id?: string;
}

export class UpdateAlertDto {
  @IsEnum(AlertSeverity)
  @IsOptional()
  severity?: AlertSeverity;

  @IsEnum(AlertStatus)
  @IsOptional()
  state?: AlertStatus;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  explanation?: string;
}