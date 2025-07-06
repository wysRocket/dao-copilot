/**
 * OpenTelemetry Tracing Configuration
 * 
 * Provides comprehensive distributed tracing setup for WebSocket and transcription services
 */

import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { 
  BatchSpanProcessor, 
  SimpleSpanProcessor, 
  ConsoleSpanExporter 
} from '@opentelemetry/sdk-trace-node'
import { logger } from '../logging'

// Environment configuration
const isProduction = process.env.NODE_ENV === 'production'
const isDevelopment = process.env.NODE_ENV === 'development'

/**
 * Tracing configuration interface
 */
export interface TracingConfig {
  serviceName: string
  serviceVersion: string
  environment: string
  otlpEndpoint?: string
  sampleRate: number
  enableConsoleExporter: boolean
  enableOTLPExporter: boolean
}

/**
 * Default tracing configuration
 */
export const defaultTracingConfig: TracingConfig = {
  serviceName: 'dao-copilot',
  serviceVersion: process.env.npm_package_version || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  sampleRate: isProduction ? 0.1 : 1.0, // 10% sampling in production, 100% in development
  enableConsoleExporter: isDevelopment,
  enableOTLPExporter: process.env.ENABLE_OTEL_EXPORT === 'true' || isProduction
}

/**
 * Create resource configuration for the service
 */
function createResource(config: TracingConfig) {
  return defaultResource().merge(
    resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.environment,
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'dao-copilot',
      // Add custom attributes
      'application.name': 'dao-copilot',
      'application.component': 'websocket-transcription',
    })
  )
}

/**
 * Configure span processors based on environment
 */
function createSpanProcessors(config: TracingConfig): Array<BatchSpanProcessor | SimpleSpanProcessor> {
  const processors: Array<BatchSpanProcessor | SimpleSpanProcessor> = []

  // Console exporter for development
  if (config.enableConsoleExporter) {
    processors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()))
  }

  // OTLP exporter for production or when explicitly enabled
  if (config.enableOTLPExporter) {
    try {
      const otlpExporter = new OTLPTraceExporter({
        url: config.otlpEndpoint,
        headers: {
          // Add authentication headers if needed
          ...(process.env.OTEL_EXPORTER_OTLP_HEADERS && {
            ...Object.fromEntries(
              process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').map(header => {
                const [key, value] = header.split('=')
                return [key.trim(), value.trim()]
              })
            )
          })
        }
      })

      processors.push(new BatchSpanProcessor(otlpExporter))
      
      logger.info('OTLP trace exporter configured', {
        metadata: {
          endpoint: config.otlpEndpoint,
          environment: config.environment
        }
      })
    } catch (error) {
      logger.error('Failed to configure OTLP trace exporter', error as Error, {
        metadata: {
          endpoint: config.otlpEndpoint,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    }
  }

  return processors
}

/**
 * Initialize OpenTelemetry SDK
 */
export function initializeTracing(config: TracingConfig = defaultTracingConfig): NodeSDK {
  try {
    const sdk = new NodeSDK({
      resource: createResource(config),
      spanProcessors: createSpanProcessors(config),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Enable specific instrumentations
          '@opentelemetry/instrumentation-http': {
            enabled: true,
            ignoreIncomingRequestHook: (req) => {
              // Ignore health check endpoints to reduce noise
              return !!(req.url?.includes('/health') || req.url?.includes('/metrics'))
            }
          },
          '@opentelemetry/instrumentation-express': {
            enabled: true
          },
          '@opentelemetry/instrumentation-fs': {
            enabled: false // Disable file system tracing to reduce noise
          },
          // Disable some instrumentations that might cause noise
          '@opentelemetry/instrumentation-dns': {
            enabled: false
          }
        })
      ]
    })

    sdk.start()

    logger.info('OpenTelemetry tracing initialized successfully', {
      metadata: {
        serviceName: config.serviceName,
        environment: config.environment,
        sampleRate: config.sampleRate,
        otlpEnabled: config.enableOTLPExporter,
        consoleEnabled: config.enableConsoleExporter
      }
    })

    return sdk
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry tracing', error as Error, {
      metadata: {
        config,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      }
    })
    throw error
  }
}

/**
 * Gracefully shutdown tracing
 */
export async function shutdownTracing(sdk: NodeSDK): Promise<void> {
  try {
    await sdk.shutdown()
    logger.info('OpenTelemetry tracing shutdown completed')
  } catch (error) {
    logger.error('Error during OpenTelemetry shutdown', error as Error)
  }
}

// Global SDK instance for singleton pattern
let globalSDK: NodeSDK | null = null

/**
 * Get or initialize the global SDK instance
 */
export function getTracingSDK(config?: TracingConfig): NodeSDK {
  if (!globalSDK) {
    globalSDK = initializeTracing(config)

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      if (globalSDK) {
        await shutdownTracing(globalSDK)
      }
    })

    process.on('SIGINT', async () => {
      if (globalSDK) {
        await shutdownTracing(globalSDK)
      }
    })
  }

  return globalSDK
}
