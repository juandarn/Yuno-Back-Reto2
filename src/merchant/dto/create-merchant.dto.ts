// src/merchants/dto/create-merchant.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateMerchantDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}