import { IsString, IsBoolean, IsJSON, IsOptional } from 'class-validator';

export class CreateNotificationChannelDto {
  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  slack?: string;

  @IsString()
  @IsOptional()
  webhook?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;

  @IsJSON()
  @IsOptional()
  config?: string;
}

export class UpdateNotificationChannelDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  slack?: string;

  @IsString()
  @IsOptional()
  webhook?: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;

  @IsJSON()
  @IsOptional()
  config?: string;
}
