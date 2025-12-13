import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

export class CreateCountryDto {
  @IsNotEmpty({ message: 'Country code is required' })
  @IsString({ message: 'Code must be a string' })
  @Length(2, 2, { message: 'Code must be exactly 2 characters' })
  code: string;

  @IsNotEmpty({ message: 'Country name is required' })
  @IsString({ message: 'Name must be a string' })
  @MaxLength(255, { message: 'Name cannot exceed 255 characters' })
  name: string;
}
