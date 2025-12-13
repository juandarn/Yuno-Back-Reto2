// src/users/dto/create-user.dto.ts
import { IsEmail, IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string; // YUNO | MERCHANT

  @IsOptional()
  @IsString()
  merchant_id?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}