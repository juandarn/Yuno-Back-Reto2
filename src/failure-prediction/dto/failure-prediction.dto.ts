import { IsString, IsEnum, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface Signal {
  name: string;
  value: number;
  normalized_value: number; // 0-1
  weight: number;
  contribution: number; // peso * valor normalizado
}

export interface FailureProbability {
  entity_type: 'merchant' | 'provider' | 'method' | 'country' | 'route';
  entity_id: string;
  entity_name: string;
  probability: number; // 0-1
  risk_level: RiskLevel;
  signals: Signal[];
  confidence: number; // basado en sample_size
  sample_size: number;
  baseline_comparison: {
    current_error_rate: number;
    baseline_error_rate: number;
    deviation_percentage: number;
  };
  trend: {
    direction: 'improving' | 'stable' | 'degrading';
    rate_of_change: number; // cambio por hora
  };
  recommended_actions: string[];
  timestamp: Date;
}

export interface PredictionSummary {
  total_entities_analyzed: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  predictions: FailureProbability[];
  global_health_score: number; // 0-100
  timestamp: Date;
}

export class QueryPredictionDto {
  @IsString()
  @IsOptional()
  merchant_id?: string;

  @IsString()
  @IsOptional()
  provider_id?: string;

  @IsString()
  @IsOptional()
  method_id?: string;

  @IsString()
  @IsOptional()
  country_code?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  time_window_minutes?: number; // default 60

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  baseline_window_hours?: number; // default 24

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  min_sample_size?: number; // default 10

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  include_low_risk?: boolean; // default false

  @IsString()
  @IsOptional()
  entity_type?: 'merchant' | 'provider' | 'method' | 'country' | 'route';
}

export class PredictionConfigDto {
  // Pesos para cada señal (deben sumar 1.0)
  weights?: {
    error_rate: number; // default 0.35
    latency: number; // default 0.25
    approval_rate: number; // default 0.25
    trend: number; // default 0.15
  };

  // Umbrales para clasificación de riesgo
  thresholds?: {
    critical: number; // default 0.75
    high: number; // default 0.5
    medium: number; // default 0.25
  };

  // Normalización de señales
  normalization?: {
    max_error_rate: number; // default 0.5 (50%)
    max_latency: number; // default 10000 (10s)
    min_approval_rate: number; // default 0.3 (30%)
  };
}