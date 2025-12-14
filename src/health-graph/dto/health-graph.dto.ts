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

export interface NodeMetrics {
  approval_rate: number;
  error_rate: number;
  p95_latency: number;
  sample_size: number;
  approval_loss_rate?: number; // Nueva métrica: tasa de pérdida de aprobaciones
  baseline_approval_rate?: number; // Tasa de aprobación del período baseline
}

export interface EdgeMetrics {
  approval_rate: number;
  error_rate: number;
  p95_latency: number;
  approval_loss_rate?: number; // Nueva métrica para edges
}

export interface GraphNode {
  id: string;
  label: string;
  type: 'merchant' | 'provider' | 'method' | 'country';
  status: NodeStatus;
  metrics: NodeMetrics;
}

export interface GraphEdge {
  from: string;
  to: string;
  status: EdgeStatus;
  label: string;
  metrics: EdgeMetrics;
}

export interface PaymentRoute {
  merchant: GraphNode;
  provider: GraphNode;
  method: GraphNode;
  country: GraphNode;
  overallStatus: NodeStatus;
  edges: GraphEdge[];
}

export interface HealthGraphSummary {
  total_routes: number;
  critical_routes: number;
  warning_routes: number;
  ok_routes: number;
}

export interface HealthGraphResponse {
  routes: PaymentRoute[];
  summary: HealthGraphSummary;
  timestamp: Date;
}

export class QueryHealthGraphDto {
  merchant_id?: string;
  provider_id?: string;
  method_id?: string;
  country_code?: string;
  time_window_minutes?: number; // default: 60
  only_issues?: boolean; // default: false
  critical_error_rate?: number; // default: 0.3
  warning_error_rate?: number; // default: 0.15
  critical_approval_rate?: number; // default: 0.5
  warning_approval_rate?: number; // default: 0.7
  critical_approval_loss_rate?: number; // default: 0.2 (20% de pérdida)
  warning_approval_loss_rate?: number; // default: 0.1 (10% de pérdida)
}