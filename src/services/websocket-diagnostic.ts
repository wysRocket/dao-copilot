/**
 * WebSocket Connection Diagnostic Tool
 *
 * This script tests various aspects of the WebSocket connection to identify
 * why the Gemini Live API WebSocket is not working.
 */

import {loadConfigFromEnvironment} from '../helpers/gemini-websocket-config'
import {getWebSocketDiagnostics} from '../utils/websocket-diagnostics'

interface DiagnosticResult {
  test: string
  passed: boolean
  message: string
  details?: Record<string, unknown>
}

class WebSocketDiagnostic {
  private results: DiagnosticResult[] = []
  private config = loadConfigFromEnvironment()

  /**
   * Run all diagnostic tests
   */
  async runDiagnostics(): Promise<DiagnosticResult[]> {
    console.log('🔍 Starting WebSocket Connection Diagnostics...\n')

    // Test 1: API Key validation
    await this.testApiKeyValidation()

    // Test 2: Environment configuration
    await this.testEnvironmentConfiguration()

    // Test 3: Basic WebSocket URL construction
    await this.testWebSocketUrlConstruction()

    // Test 4: Network connectivity to Google APIs
    await this.testNetworkConnectivity()

    // Test 5: WebSocket connection establishment
    await this.testWebSocketConnection()

    // Test 6: WebSocket diagnostics system
    await this.testWebSocketDiagnosticsSystem()

    // Test 7: Gemini Live client instantiation
    await this.testGeminiLiveClientInstantiation()

    this.printSummary()
    return this.results
  }

  /**
   * Test API key validation
   */
  private async testApiKeyValidation(): Promise<void> {
    console.log('📋 Test 1: API Key Validation')

    const apiKey = this.config.apiKey

    if (!apiKey) {
      this.addResult({
        test: 'API Key Presence',
        passed: false,
        message: 'API key is not defined in environment variables',
        details: {
          checkedVariables: [
            'GEMINI_API_KEY',
            'GOOGLE_API_KEY',
            'VITE_GOOGLE_API_KEY',
            'GOOGLE_GENERATIVE_AI_API_KEY'
          ],
          foundValue: apiKey
        }
      })
      return
    }

    // Basic format validation
    const isValidFormat = /^[A-Za-z0-9_-]{20,}$/.test(apiKey)

    this.addResult({
      test: 'API Key Format',
      passed: isValidFormat,
      message: isValidFormat
        ? 'API key format appears valid'
        : 'API key format may be invalid (expected 20+ alphanumeric characters)',
      details: {
        keyLength: apiKey.length,
        keyPreview: apiKey.substring(0, 8) + '...',
        formatValid: isValidFormat
      }
    })

    // Test with a simple API call to validate key
    try {
      const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      const response = await fetch(testUrl, {method: 'GET'})

      const passed = response.status === 200
      this.addResult({
        test: 'API Key Authentication',
        passed,
        message: passed
          ? 'API key authentication successful'
          : `API key authentication failed (status: ${response.status})`,
        details: {
          statusCode: response.status,
          statusText: response.statusText
        }
      })
    } catch (error) {
      this.addResult({
        test: 'API Key Authentication',
        passed: false,
        message: 'Failed to test API key authentication',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    }
  }

  /**
   * Test environment configuration
   */
  private async testEnvironmentConfiguration(): Promise<void> {
    console.log('📋 Test 2: Environment Configuration')

    const requiredConfig = {
      websocketEnabled: this.config.websocketEnabled,
      apiVersion: this.config.apiVersion,
      modelName: this.config.modelName,
      connectionTimeout: this.config.connectionTimeout
    }

    const passed = Object.values(requiredConfig).every(
      value => value !== undefined && value !== null
    )

    this.addResult({
      test: 'Environment Configuration',
      passed,
      message: passed
        ? 'All required configuration values are present'
        : 'Some required configuration values are missing',
      details: requiredConfig
    })
  }

  /**
   * Test WebSocket URL construction
   */
  private async testWebSocketUrlConstruction(): Promise<void> {
    console.log('📋 Test 3: WebSocket URL Construction')

    try {
      const apiVersion = this.config.apiVersion || 'v1beta'
      const baseUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent`
      const params = new URLSearchParams({key: this.config.apiKey})
      const finalUrl = `${baseUrl}?${params.toString()}`

      // Validate URL format
      const urlObj = new URL(finalUrl)
      const isSecure = urlObj.protocol === 'wss:'

      this.addResult({
        test: 'WebSocket URL Construction',
        passed: isSecure,
        message: isSecure
          ? 'WebSocket URL construction successful'
          : 'WebSocket URL does not use secure protocol',
        details: {
          protocol: urlObj.protocol,
          host: urlObj.host,
          pathname: urlObj.pathname,
          hasApiKey: urlObj.searchParams.has('key')
        }
      })
    } catch (error) {
      this.addResult({
        test: 'WebSocket URL Construction',
        passed: false,
        message: 'Failed to construct WebSocket URL',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    }
  }

  /**
   * Test network connectivity to Google APIs
   */
  private async testNetworkConnectivity(): Promise<void> {
    console.log('📋 Test 4: Network Connectivity')

    try {
      // Test basic connectivity to Google's generative language API
      const testUrl = 'https://generativelanguage.googleapis.com/v1beta/models'
      const response = await fetch(testUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      })

      const passed = response.status < 500 // Any response except server errors indicates connectivity

      this.addResult({
        test: 'Network Connectivity',
        passed,
        message: passed
          ? 'Network connectivity to Google APIs successful'
          : `Network connectivity failed (status: ${response.status})`,
        details: {
          statusCode: response.status,
          responseTime: Date.now()
        }
      })
    } catch (error) {
      this.addResult({
        test: 'Network Connectivity',
        passed: false,
        message: 'Failed to connect to Google APIs',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    }
  }

  /**
   * Test actual WebSocket connection
   */
  private async testWebSocketConnection(): Promise<void> {
    console.log('📋 Test 5: WebSocket Connection')

    return new Promise<void>(resolve => {
      try {
        const apiVersion = this.config.apiVersion || 'v1beta'
        const baseUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent`
        const params = new URLSearchParams({key: this.config.apiKey})
        const wsUrl = `${baseUrl}?${params.toString()}`

        const ws = new WebSocket(wsUrl)
        let connectionEstablished = false

        const timeout = setTimeout(() => {
          if (!connectionEstablished) {
            ws.close()
            this.addResult({
              test: 'WebSocket Connection',
              passed: false,
              message: 'WebSocket connection timed out after 10 seconds',
              details: {timeout: 10000}
            })
            resolve()
          }
        }, 10000)

        ws.onopen = () => {
          connectionEstablished = true
          clearTimeout(timeout)

          this.addResult({
            test: 'WebSocket Connection',
            passed: true,
            message: 'WebSocket connection established successfully',
            details: {connectionTime: Date.now()}
          })

          ws.close()
          resolve()
        }

        ws.onerror = error => {
          clearTimeout(timeout)
          this.addResult({
            test: 'WebSocket Connection',
            passed: false,
            message: 'WebSocket connection failed with error',
            details: {error: error.toString()}
          })
          resolve()
        }

        ws.onclose = event => {
          if (!connectionEstablished) {
            clearTimeout(timeout)
            this.addResult({
              test: 'WebSocket Connection',
              passed: false,
              message: `WebSocket connection closed before opening (code: ${event.code})`,
              details: {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean
              }
            })
            resolve()
          }
        }
      } catch (error) {
        this.addResult({
          test: 'WebSocket Connection',
          passed: false,
          message: 'Failed to create WebSocket connection',
          details: {
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        })
        resolve()
      }
    })
  }

  /**
   * Test WebSocket diagnostics system
   */
  private async testWebSocketDiagnosticsSystem(): Promise<void> {
    console.log('📋 Test 6: WebSocket Diagnostics System')

    try {
      const diagnostics = getWebSocketDiagnostics()
      const metrics = diagnostics.getMetrics()

      this.addResult({
        test: 'WebSocket Diagnostics',
        passed: true,
        message: 'WebSocket diagnostics system is functional',
        details: {
          totalMessages: metrics.totalMessages,
          averageLatency: metrics.averageLatency,
          connectionRetries: metrics.connectionRetries,
          networkCondition: metrics.networkCondition
        }
      })
    } catch (error) {
      this.addResult({
        test: 'WebSocket Diagnostics',
        passed: false,
        message: 'WebSocket diagnostics system failed',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    }
  }

  /**
   * Test Gemini Live client instantiation
   */
  private async testGeminiLiveClientInstantiation(): Promise<void> {
    console.log('📋 Test 7: Gemini Live Client Instantiation')

    try {
      const {default: GeminiLiveWebSocketClient, ResponseModality} = await import(
        './gemini-live-websocket'
      )

      const client = new GeminiLiveWebSocketClient({
        apiKey: this.config.apiKey,
        model: this.config.modelName,
        responseModalities: [ResponseModality.TEXT],
        connectionTimeout: 5000
      })

      this.addResult({
        test: 'Gemini Live Client',
        passed: true,
        message: 'Gemini Live WebSocket client instantiated successfully',
        details: {
          clientCreated: !!client,
          hasConnectMethod: typeof client.connect === 'function'
        }
      })
    } catch (error) {
      this.addResult({
        test: 'Gemini Live Client',
        passed: false,
        message: 'Failed to instantiate Gemini Live WebSocket client',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    }
  }

  /**
   * Add a test result
   */
  private addResult(result: DiagnosticResult): void {
    this.results.push(result)
    const status = result.passed ? '✅' : '❌'
    console.log(`  ${status} ${result.test}: ${result.message}`)
    if (result.details && !result.passed) {
      console.log(`     Details:`, result.details)
    }
    console.log('')
  }

  /**
   * Print diagnostic summary
   */
  private printSummary(): void {
    const total = this.results.length
    const passed = this.results.filter(r => r.passed).length
    const failed = total - passed

    console.log('🏁 Diagnostic Summary')
    console.log('='.repeat(50))
    console.log(`Total Tests: ${total}`)
    console.log(`Passed: ${passed} ✅`)
    console.log(`Failed: ${failed} ❌`)
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`)
    console.log('')

    if (failed > 0) {
      console.log('Failed Tests:')
      this.results.filter(r => !r.passed).forEach(r => console.log(`  - ${r.test}: ${r.message}`))
    }
  }
}

/**
 * Export diagnostic runner function
 */
export async function runWebSocketDiagnostics(): Promise<DiagnosticResult[]> {
  const diagnostic = new WebSocketDiagnostic()
  return await diagnostic.runDiagnostics()
}

/**
 * Main execution when run directly
 */
if (require.main === module) {
  runWebSocketDiagnostics().catch(console.error)
}
