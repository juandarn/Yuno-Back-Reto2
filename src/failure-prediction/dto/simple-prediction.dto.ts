import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class SimplePredictionQueryDto {
    @IsOptional()
    @IsString()
    merchant_id?: string;

    @IsOptional()
    @IsString()
    provider_id?: string;

    @IsOptional()
    @IsString()
    method_id?: string;

    @IsOptional()
    @IsString()
    country_code?: string;

    // Opcionales por si quieres control
    @IsOptional()
    @IsNumberString()
    time_window_minutes?: string;

    @IsOptional()
    @IsNumberString()
    baseline_window_hours?: string;

    @IsOptional()
    @IsNumberString()
    min_sample_size?: string;
}
