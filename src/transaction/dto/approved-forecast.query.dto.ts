// src/transactions/dto/approved-forecast.query.dto.ts
import {
  IsISO8601,
  IsOptional,
  IsUUID,
  IsString,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ApprovedForecastQueryDto {
  @IsUUID()
  merchant_id: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  provider_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  method_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country_code?: string;

  @IsISO8601()
  from: string;

  @IsISO8601()
  to: string;
}
