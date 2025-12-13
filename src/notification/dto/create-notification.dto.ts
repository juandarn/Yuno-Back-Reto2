import { IsString, IsEmail, IsEnum, IsOptional, IsJSON } from 'class-validator';

export enum NotificationStatus {
  SENT = 'sent',
  FAILED = 'failed',
  PENDING = 'pending',
}

export class CreateNotificationDto {
  @IsString()
  alerta_id: string;

  @IsString()
  usuario_id: string;

  @IsString()
  canal_id: string;

  @IsEnum(NotificationStatus)
  @IsOptional()
  estado?: NotificationStatus;

  @IsJSON()
  @IsOptional()
  payload?: string;
}
