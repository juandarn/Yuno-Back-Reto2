import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateProviderDto {
  @IsNotEmpty({ message: 'Provider name is required' })
  @IsString({ message: 'Name must be a string' })
  @MaxLength(255, { message: 'Name cannot exceed 255 characters' })
  name: string;
}
