import React, {useState, useCallback, useEffect} from 'react'
import {UnifiedPerformanceService} from '../services/unified-performance'
import {QuotaManager} from '../services/quota-manager'
import {getTranscriptionSystemReport} from '../services/main-stt-transcription'

interface SystemReport {
  performance: string
  quotaStatus: string
  systemHealth: 'excellent' | 'good' | 'warning' | 'critical'
  recommendations: string[]
}

export const TranscriptionPerformanceDashboard: React.FC = () => {
  const [report, setReport] = useState<SystemReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const loadReport = useCallback(async () => {
    setIsLoading(true)
    try {
      const systemReport = await getTranscriptionSystemReport()
      setReport(systemReport)
    } catch (error) {
      console.error('Failed to load system report:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearMetrics = useCallback(() => {
    const performanceService = UnifiedPerformanceService.getInstance()
    const quotaManager = QuotaManager.getInstance()
    
    performanceService.clearMetrics()
    quotaManager.clearAllErrors()
    
    // Reload report after clearing
    loadReport()
  }, [loadReport])

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadReport, 5000) // Refresh every 5 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh, loadReport])

  // Load initial report
  useEffect(() => {
    loadReport()
  }, [loadReport])

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'excellent': return 'text-green-600 dark:text-green-400'
      case 'good': return 'text-blue-600 dark:text-blue-400'
      case 'warning': return 'text-yellow-600 dark:text-yellow-400'
      case 'critical': return 'text-red-600 dark:text-red-400'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'excellent': return '🟢'
      case 'good': return '🔵'
      case 'warning': return '🟡'
      case 'critical': return '🔴'
      default: return '⚪'
    }
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          🔍 Transcription Performance Dashboard
        </h2>
        <div className="flex items-center gap-4">
          <button
            onClick={loadReport}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
          <button
            onClick={clearMetrics}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            🧹 Clear Metrics
          </button>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Auto-refresh</span>
          </label>
        </div>
      </div>

      {report && (
        <div className="space-y-6">
          {/* System Health */}
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">
              {getHealthIcon(report.systemHealth)} System Health: 
              <span className={`ml-2 ${getHealthColor(report.systemHealth)}`}>
                {report.systemHealth.toUpperCase()}
              </span>
            </h3>
            <div className="space-y-1">
              {report.recommendations.map((rec, index) => (
                <div key={index} className="text-sm text-gray-600 dark:text-gray-300">
                  • {rec}
                </div>
              ))}
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">📊 Performance Metrics</h3>
            <pre className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap overflow-x-auto">
              {report.performance}
            </pre>
          </div>

          {/* Quota Status */}
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">🔐 Quota Status</h3>
            <pre className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
              {report.quotaStatus}
            </pre>
          </div>
        </div>
      )}

      {!report && !isLoading && (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          <p>📊 No performance data available yet</p>
          <p className="text-sm mt-2">Start a transcription to see performance metrics</p>
        </div>
      )}
    </div>
  )
}

export default TranscriptionPerformanceDashboard
