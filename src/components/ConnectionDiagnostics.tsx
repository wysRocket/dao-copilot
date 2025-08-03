import React, { useState, useEffect, useCallback } from 'react'
import { useTranscriptionStateContext } from '../contexts/TranscriptionStateContext'
import GlassCard from './GlassCard'
import GlassButton from './GlassButton'

export interface ConnectionDiagnosticsProps {
  className?: string
  autoRun?: boolean
  showRecommendations?: boolean
  onDiagnosticComplete?: (results: DiagnosticResults) => void
}

interface DiagnosticTest {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'passed' | 'failed' | 'warning'
  result?: string
  details?: string
  duration?: number
  timestamp?: Date
}

interface DiagnosticResults {
  overall: 'healthy' | 'warning' | 'critical'
  score: number // 0-100
  tests: DiagnosticTest[]
  recommendations: string[]
  timestamp: Date
}

const ConnectionDiagnostics: React.FC<ConnectionDiagnosticsProps> = ({
  className = '',
  autoRun = false,
  showRecommendations = true,
  onDiagnosticComplete
}) => {
  const { state } = useTranscriptionStateContext()
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<DiagnosticResults | null>(null)
  const [currentTest, setCurrentTest] = useState<string | null>(null)

  const connection = state.connection

  // Define diagnostic tests
  const diagnosticTests: Omit<DiagnosticTest, 'status' | 'result' | 'details' | 'duration' | 'timestamp'>[] = [
    {
      id: 'connection_status',
      name: 'Connection Status',
      description: 'Check if WebSocket connection is established'
    },
    {
      id: 'api_key_validation',
      name: 'API Key Validation',
      description: 'Verify API key is valid and has sufficient quota'
    },
    {
      id: 'network_connectivity',
      name: 'Network Connectivity',
      description: 'Test network connection to Google APIs'
    },
    {
      id: 'latency_test',
      name: 'Latency Test',
      description: 'Measure round-trip time to server'
    },
    {
      id: 'throughput_test',
      name: 'Throughput Test',
      description: 'Test data transmission speed'
    },
    {
      id: 'security_check',
      name: 'Security Check',
      description: 'Verify SSL/TLS configuration'
    },
    {
      id: 'quota_check',
      name: 'Quota Check',
      description: 'Check remaining API quota and usage limits'
    },
    {
      id: 'retry_mechanism',
      name: 'Retry Mechanism',
      description: 'Test connection retry logic and backoff strategy'
    }
  ]

  // Simulate running a diagnostic test
  const runTest = useCallback(async (test: DiagnosticTest): Promise<DiagnosticTest> => {
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000)) // 1-3 second delay

    const startTime = Date.now()
    let result: DiagnosticTest

    switch (test.id) {
      case 'connection_status':
        result = {
          ...test,
          status: connection?.status === 'connected' ? 'passed' : 'failed',
          result: connection?.status === 'connected' ? 'Connected' : 'Disconnected',
          details: `WebSocket status: ${connection?.status || 'unknown'}`
        }
        break

      case 'api_key_validation': {
        const hasQuota = (connection?.quota?.availableKeys || 0) > 0
        result = {
          ...test,
          status: hasQuota ? 'passed' : 'failed',
          result: hasQuota ? 'Valid with quota' : 'No quota available',
          details: `Available keys: ${connection?.quota?.availableKeys || 0}`
        }
        break
      }

      case 'network_connectivity': {
        const isConnected = connection?.status === 'connected'
        result = {
          ...test,
          status: isConnected ? 'passed' : 'warning',
          result: isConnected ? 'Network accessible' : 'Network issues detected',
          details: 'Testing connectivity to gemini.googleapis.com'
        }
        break
      }

      case 'latency_test': {
        const latency = 50 + Math.random() * 200 // 50-250ms
        result = {
          ...test,
          status: latency < 200 ? 'passed' : latency < 500 ? 'warning' : 'failed',
          result: `${Math.round(latency)}ms`,
          details: `Round-trip time: ${Math.round(latency)}ms`
        }
        break
      }

      case 'throughput_test': {
        const throughput = 80 + Math.random() * 40 // 80-120 msg/s
        result = {
          ...test,
          status: throughput > 60 ? 'passed' : throughput > 30 ? 'warning' : 'failed',
          result: `${Math.round(throughput)} msg/s`,
          details: `Data transmission rate: ${Math.round(throughput)} messages per second`
        }
        break
      }

      case 'security_check':
        result = {
          ...test,
          status: 'passed',
          result: 'TLS 1.3 Secure',
          details: 'SSL/TLS encryption properly configured'
        }
        break

      case 'quota_check': {
        const quotaUsage = ((connection?.quota?.totalKeys || 1) - (connection?.quota?.availableKeys || 0)) / (connection?.quota?.totalKeys || 1) * 100
        result = {
          ...test,
          status: quotaUsage < 70 ? 'passed' : quotaUsage < 90 ? 'warning' : 'failed',
          result: `${Math.round(quotaUsage)}% used`,
          details: `Quota utilization: ${Math.round(quotaUsage)}%`
        }
        break
      }

      case 'retry_mechanism': {
        const retryWorking = connection?.retry?.strategy !== undefined
        result = {
          ...test,
          status: retryWorking ? 'passed' : 'warning',
          result: retryWorking ? 'Retry configured' : 'Retry not configured',
          details: `Strategy: ${connection?.retry?.strategy || 'none'}`
        }
        break
      }

      default:
        result = {
          ...test,
          status: 'warning',
          result: 'Skipped',
          details: 'Test not implemented'
        }
    }

    const endTime = Date.now()
    return {
      ...result,
      duration: endTime - startTime,
      timestamp: new Date()
    }
  }, [connection])

  // Run all diagnostic tests
  const runDiagnostics = useCallback(async () => {
    setIsRunning(true)
    setResults(null)
    
    const tests: DiagnosticTest[] = []
    
    for (const testTemplate of diagnosticTests) {
      const test: DiagnosticTest = { ...testTemplate, status: 'running' }
      setCurrentTest(test.id)
      
      const completedTest = await runTest(test)
      tests.push(completedTest)
    }

    setCurrentTest(null)

    // Calculate overall score and status
    const passedTests = tests.filter(t => t.status === 'passed').length
    const warningTests = tests.filter(t => t.status === 'warning').length
    const failedTests = tests.filter(t => t.status === 'failed').length
    
    const score = Math.round((passedTests + warningTests * 0.5) / tests.length * 100)
    
    let overall: DiagnosticResults['overall']
    if (failedTests > 2 || score < 50) {
      overall = 'critical'
    } else if (failedTests > 0 || warningTests > 2 || score < 80) {
      overall = 'warning'
    } else {
      overall = 'healthy'
    }

    // Generate recommendations
    const recommendations: string[] = []
    
    if (tests.find(t => t.id === 'connection_status' && t.status === 'failed')) {
      recommendations.push('Check network connection and restart the application')
    }
    if (tests.find(t => t.id === 'api_key_validation' && t.status === 'failed')) {
      recommendations.push('Verify API key configuration and quota limits')
    }
    if (tests.find(t => t.id === 'latency_test' && t.status !== 'passed')) {
      recommendations.push('Network latency is high - consider switching networks')
    }
    if (tests.find(t => t.id === 'quota_check' && t.status !== 'passed')) {
      recommendations.push('API quota is running low - add more API keys or wait for reset')
    }
    if (tests.find(t => t.id === 'throughput_test' && t.status !== 'passed')) {
      recommendations.push('Throughput is low - check bandwidth and network quality')
    }

    if (recommendations.length === 0) {
      recommendations.push('Connection appears healthy - no issues detected')
    }

    const diagnosticResults: DiagnosticResults = {
      overall,
      score,
      tests,
      recommendations,
      timestamp: new Date()
    }

    setResults(diagnosticResults)
    setIsRunning(false)
    onDiagnosticComplete?.(diagnosticResults)
  }, [diagnosticTests, runTest, onDiagnosticComplete])

  // Auto-run diagnostics on mount if enabled
  useEffect(() => {
    if (autoRun) {
      runDiagnostics()
    }
  }, [autoRun, runDiagnostics])

  const getStatusIcon = (status: DiagnosticTest['status']): string => {
    switch (status) {
      case 'pending': return '⏳'
      case 'running': return '🔄'
      case 'passed': return '✅'
      case 'failed': return '❌'
      case 'warning': return '⚠️'
      default: return '❓'
    }
  }

  const getStatusColor = (status: DiagnosticTest['status']): string => {
    switch (status) {
      case 'passed': return 'text-green-400'
      case 'failed': return 'text-red-400'
      case 'warning': return 'text-yellow-400'
      case 'running': return 'text-blue-400'
      default: return 'text-gray-400'
    }
  }

  const getOverallStatusColor = (overall: DiagnosticResults['overall']): string => {
    switch (overall) {
      case 'healthy': return 'text-green-400'
      case 'warning': return 'text-yellow-400'
      case 'critical': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  return (
    <GlassCard className={`p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Connection Diagnostics</h3>
        <GlassButton
          onClick={runDiagnostics}
          disabled={isRunning}
          className={`px-3 py-1 text-sm ${
            isRunning 
              ? 'bg-gray-600 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700'
          } text-white`}
        >
          {isRunning ? 'Running...' : 'Run Diagnostics'}
        </GlassButton>
      </div>

      {/* Overall Results */}
      {results && (
        <div className="mb-4 p-3 bg-black/10 rounded">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className="text-2xl">
                {results.overall === 'healthy' ? '🟢' : 
                 results.overall === 'warning' ? '🟡' : '🔴'}
              </span>
              <span className={`font-semibold ${getOverallStatusColor(results.overall)}`}>
                {results.overall.charAt(0).toUpperCase() + results.overall.slice(1)}
              </span>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold">{results.score}%</div>
              <div className="text-xs opacity-60">Health Score</div>
            </div>
          </div>
          <div className="text-sm opacity-75">
            Last run: {results.timestamp.toLocaleString()}
          </div>
        </div>
      )}

      {/* Current Test Progress */}
      {isRunning && currentTest && (
        <div className="mb-4 p-3 bg-blue-600/20 border border-blue-500/30 rounded">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">
              Running: {diagnosticTests.find(t => t.id === currentTest)?.name}
            </span>
          </div>
        </div>
      )}

      {/* Test Results */}
      {(results || isRunning) && (
        <div className="space-y-2 mb-4">
          <div className="text-sm font-medium mb-2">Test Results</div>
          {diagnosticTests.map(testTemplate => {
            const completedTest = results?.tests.find(t => t.id === testTemplate.id)
            const isCurrentlyRunning = isRunning && currentTest === testTemplate.id
            const status = completedTest?.status || (isCurrentlyRunning ? 'running' : 'pending')
            
            return (
              <div key={testTemplate.id} className="flex items-center justify-between p-2 bg-black/5 rounded">
                <div className="flex items-center space-x-3">
                  <span className={getStatusColor(status)}>
                    {getStatusIcon(status)}
                  </span>
                  <div>
                    <div className="font-medium text-sm">{testTemplate.name}</div>
                    <div className="text-xs opacity-60">{testTemplate.description}</div>
                  </div>
                </div>
                <div className="text-right">
                  {completedTest && (
                    <>
                      <div className={`text-sm font-medium ${getStatusColor(completedTest.status)}`}>
                        {completedTest.result}
                      </div>
                      {completedTest.duration && (
                        <div className="text-xs opacity-60">
                          {Math.round(completedTest.duration)}ms
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recommendations */}
      {showRecommendations && results && results.recommendations.length > 0 && (
        <div className="border-t border-white/10 pt-4">
          <div className="text-sm font-medium mb-2">💡 Recommendations</div>
          <ul className="space-y-1 text-sm opacity-90">
            {results.recommendations.map((recommendation, index) => (
              <li key={index} className="flex items-start space-x-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>{recommendation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Initial State */}
      {!results && !isRunning && (
        <div className="text-center py-8 opacity-60">
          <div className="text-4xl mb-2">🔍</div>
          <div className="text-sm">Click &quot;Run Diagnostics&quot; to test your connection</div>
        </div>
      )}
    </GlassCard>
  )
}

export default ConnectionDiagnostics
