// src/transactions/dto/approved-forecast.response.dto.ts
export type ApprovedForecastPointDto = {
  date: string; // YYYY-MM-DD
  actual: number; // aprobadas reales ese día
  expected: number; // esperado ese día según patrón
};

export type ApprovedForecastResponseDto = {
  filters: {
    merchant_id: string;
    provider_id?: string;
    method_id?: string;
    country_code?: string;
  };
  range: { from: string; to: string };
  weeks_history: number;
  series: ApprovedForecastPointDto[];
};
