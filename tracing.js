'use strict';

/**
 * OpenTelemetry Tracing Setup
 * ----------------------------
 * Must be required BEFORE any other modules so auto-instrumentation
 * can patch Express, HTTP, etc. at import time.
 *
 * Env vars:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — OTLP collector URL (e.g. http://jaeger:4318)
 *   OTEL_SERVICE_NAME            — service name (defaults to task-manager-backend)
 *   OTEL_SDK_DISABLED            — set "true" to disable tracing entirely
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-node');

if (process.env.OTEL_SDK_DISABLED === 'true') {
  console.log('[tracing] OpenTelemetry SDK disabled via OTEL_SDK_DISABLED=true');
} else {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  // Use OTLP exporter when a collector is configured, otherwise console (local dev)
  const traceExporter = otlpEndpoint
    ? new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })
    : new ConsoleSpanExporter();

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'task-manager-backend',
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Reduce noise: disable fs instrumentation
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown on process exit
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('[tracing] OpenTelemetry SDK shut down cleanly'))
      .catch((err) => console.error('[tracing] Error shutting down SDK:', err))
      .finally(() => process.exit(0));
  });
}
