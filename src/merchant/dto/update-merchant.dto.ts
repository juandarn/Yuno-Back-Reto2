// src/merchants/dto/update-merchant.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateMerchantDto } from './create-merchant.dto';

export class UpdateMerchantDto extends PartialType(CreateMerchantDto) {}