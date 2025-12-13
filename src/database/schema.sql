-- Schema para el sistema de notificaciones

-- Tabla de Métricas
CREATE TABLE metricas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo VARCHAR(100) NOT NULL,
    timestamptz TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valor DECIMAL(10, 2),
    muestra TEXT,
    score_anomalia DECIMAL(5, 2),
    merchant_id UUID,
    provider_id UUID,
    metodo_id UUID,
    pais_codigo CHAR(2),
    approval_rate DECIMAL(5, 2),
    error_rate DECIMAL(5, 2),
    p95_latency DECIMAL(10, 2)
);

-- Índices para métricas
CREATE INDEX idx_metricas_tipo ON metricas(tipo);
CREATE INDEX idx_metricas_timestamp ON metricas(timestamptz);
CREATE INDEX idx_metricas_merchant ON metricas(merchant_id);
CREATE INDEX idx_metricas_score ON metricas(score_anomalia);

-- Tabla de Alertas
CREATE TABLE alertas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metrica_id UUID NOT NULL REFERENCES metricas(id) ON DELETE CASCADE,
    fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    severidad VARCHAR(50) NOT NULL CHECK (severidad IN ('info', 'warning', 'critical')),
    estado VARCHAR(50) DEFAULT 'open' CHECK (estado IN ('open', 'ack', 'resolved')),
    titulo VARCHAR(255) NOT NULL,
    explicacion TEXT,
    merchant_id UUID
);

-- Índices para alertas
CREATE INDEX idx_alertas_metrica ON alertas(metrica_id);
CREATE INDEX idx_alertas_estado ON alertas(estado);
CREATE INDEX idx_alertas_severidad ON alertas(severidad);
CREATE INDEX idx_alertas_merchant ON alertas(merchant_id);
CREATE INDEX idx_alertas_fecha ON alertas(fecha);

-- Tabla de Canales de Notificación
CREATE TABLE canales_notificacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    slack VARCHAR(255),
    webhook VARCHAR(500),
    activo BOOLEAN DEFAULT true,
    config JSONB
);

-- Índices para canales
CREATE INDEX idx_canales_activo ON canales_notificacion(activo);

-- Tabla de Notificaciones
CREATE TABLE notificaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alerta_id UUID NOT NULL REFERENCES alertas(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL,
    canal_id UUID NOT NULL REFERENCES canales_notificacion(id) ON DELETE CASCADE,
    enviado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(50) DEFAULT 'pending' CHECK (estado IN ('sent', 'failed', 'pending')),
    payload JSONB
);

-- Índices para notificaciones
CREATE INDEX idx_notificaciones_alerta ON notificaciones(alerta_id);
CREATE INDEX idx_notificaciones_usuario ON notificaciones(usuario_id);
CREATE INDEX idx_notificaciones_canal ON notificaciones(canal_id);
CREATE INDEX idx_notificaciones_estado ON notificaciones(estado);
CREATE INDEX idx_notificaciones_fecha ON notificaciones(enviado_en);

-- Comentarios en las tablas
COMMENT ON TABLE metricas IS 'Almacena métricas del sistema para análisis y detección de anomalías';
COMMENT ON TABLE alertas IS 'Alertas generadas automáticamente basadas en anomalías en métricas';
COMMENT ON TABLE canales_notificacion IS 'Configuración de canales de notificación (Gmail, Slack, WhatsApp, etc.)';
COMMENT ON TABLE notificaciones IS 'Registro de notificaciones enviadas';

-- Función para limpiar notificaciones antiguas (opcional)
CREATE OR REPLACE FUNCTION limpiar_notificaciones_antiguas()
RETURNS void AS $$
BEGIN
    DELETE FROM notificaciones
    WHERE enviado_en < NOW() - INTERVAL '90 days'
    AND estado = 'sent';
END;
$$ LANGUAGE plpgsql;

-- Función para obtener estadísticas de alertas
CREATE OR REPLACE FUNCTION estadisticas_alertas(dias INTEGER DEFAULT 7)
RETURNS TABLE (
    total_alertas BIGINT,
    alertas_abiertas BIGINT,
    alertas_criticas BIGINT,
    tasa_resolucion DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_alertas,
        COUNT(*) FILTER (WHERE estado = 'open') as alertas_abiertas,
        COUNT(*) FILTER (WHERE severidad = 'critical') as alertas_criticas,
        CASE 
            WHEN COUNT(*) > 0 THEN
                (COUNT(*) FILTER (WHERE estado = 'resolved')::DECIMAL / COUNT(*)) * 100
            ELSE 0
        END as tasa_resolucion
    FROM alertas
    WHERE fecha >= NOW() - (dias || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Vista para alertas activas con detalles
CREATE OR REPLACE VIEW v_alertas_activas AS
SELECT 
    a.id,
    a.titulo,
    a.severidad,
    a.estado,
    a.fecha,
    m.tipo as metrica_tipo,
    m.valor as metrica_valor,
    m.error_rate,
    m.approval_rate,
    m.p95_latency,
    a.merchant_id
FROM alertas a
JOIN metricas m ON a.metrica_id = m.id
WHERE a.estado IN ('open', 'ack')
ORDER BY a.fecha DESC;

-- Vista para métricas recientes con anomalías
CREATE OR REPLACE VIEW v_metricas_anomalias AS
SELECT 
    id,
    tipo,
    timestamptz,
    valor,
    score_anomalia,
    error_rate,
    approval_rate,
    p95_latency,
    merchant_id
FROM metricas
WHERE score_anomalia > 0.5
   OR error_rate > 0.1
   OR approval_rate < 0.7
   OR p95_latency > 5000
ORDER BY timestamptz DESC
LIMIT 100;

-- Datos de ejemplo para canales de notificación
INSERT INTO canales_notificacion (nombre, email, activo, config)
VALUES 
    ('Gmail Principal', 'alerts@example.com', true, '{"priority": "high", "template": "default"}'),
    ('Gmail Crítico', 'critical-alerts@example.com', true, '{"priority": "critical", "template": "urgent"}');
