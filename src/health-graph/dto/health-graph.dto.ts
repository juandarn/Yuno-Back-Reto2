import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export enum NodeStatus {
  OK = 'ok',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum EdgeStatus {
  OK = 'ok',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export class GraphNode {
  id: string;
  label: string;
  type: 'merchant' | 'provider' | 'method' | 'country';
  status: NodeStatus;
  metrics?: {
    approval_rate?: number;
    error_rate?: number;
    p95_latency?: number;
    sample_size?: number;
  };
}

export class GraphEdge {
  from: string;
  to: string;
  status: EdgeStatus;
  label?: string;
  metrics?: {
    approval_rate?: number;
    error_rate?: number;
    p95_latency?: number;
  };
}

export class PaymentRoute {
  merchant: GraphNode;
  provider: GraphNode;
  method: GraphNode;
  country: GraphNode;
  overallStatus: NodeStatus;
  edges: GraphEdge[];
}

export class HealthGraphResponse {
  routes: PaymentRoute[];
  summary: {
    total_routes: number;
    critical_routes: number;
    warning_routes: number;
    ok_routes: number;
  };
  timestamp: Date;
}

export class QueryHealthGraphDto {
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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  time_window_minutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  critical_error_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  warning_error_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  critical_approval_rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  warning_approval_rate?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  only_issues?: boolean;
}
