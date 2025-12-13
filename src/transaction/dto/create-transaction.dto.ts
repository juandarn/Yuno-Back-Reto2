// src/transactions/dto/create-transaction.dto.ts
import { IsNotEmpty, IsString, IsOptional, IsEnum, IsInt, IsDateString } from 'class-validator';
import { TxStatus, TxErrorType } from '../../common/enums';

export class CreateTransactionDto {
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  merchant_id: string;

  @IsString()
  @IsNotEmpty()
  provider_id: string;

  @IsString()
  @IsNotEmpty()
  method_id: string;

  @IsString()
  @IsNotEmpty()
  country_code: string;

  @IsEnum(TxStatus)
  @IsNotEmpty()
  status: TxStatus;

  @IsOptional()
  @IsEnum(TxErrorType)
  error_type?: TxErrorType;

  @IsOptional()
  @IsInt()
  latency_ms?: number;
}