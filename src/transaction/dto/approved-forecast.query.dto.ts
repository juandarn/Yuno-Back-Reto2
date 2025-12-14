// src/transactions/dto/approved-forecast.query.dto.ts
import { IsISO8601, IsOptional, IsUUID, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class ApprovedForecastQueryDto {
  @IsUUID()
  @IsOptional()
  merchant_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  provider_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  method_id?: number;

  @IsOptional()
  @IsString()
  country_code?: string;

  @IsISO8601()
  from: string;

  @IsISO8601()
  to: string;
}
