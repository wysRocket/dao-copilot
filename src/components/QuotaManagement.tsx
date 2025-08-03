import React, { useState, useEffect, useCallback } from 'react'
import { useTranscriptionStateContext } from '../contexts/TranscriptionStateContext'
import GlassCard from './GlassCard'
import GlassButton from './GlassButton'

export interface QuotaManagementProps {
  className?: string
  showAPIKeyManagement?: boolean
  showUsageProjections?: boolean
  showRecommendations?: boolean
  onAddAPIKey?: () => void
  onRemoveAPIKey?: (keyId: string) => void
  onRefreshQuota?: () => void
}

interface APIKeyInfo {
  id: string
  name: string
  isActive: boolean
  quotaUsed: number
  quotaLimit: number
  lastUsed: Date
  status: 'active' | 'inactive' | 'expired' | 'error'
}

interface UsageProjection {
  currentRate: number // requests per hour
  projectedDailyUsage: number
  projectedWeeklyUsage: number
  projectedMonthlyUsage: number
  timeToQuotaExhaustion: number // in hours
}

const QuotaManagement: React.FC<QuotaManagementProps> = ({
  className = '',
  showAPIKeyManagement = true,
  showUsageProjections = true,
  showRecommendations = true,
  onAddAPIKey,
  onRemoveAPIKey,
  onRefreshQuota
}) => {
  const { state } = useTranscriptionStateContext()
  const [activeTab, setActiveTab] = useState<'overview' | 'keys' | 'projections'>('overview')
  const [usageHistory, setUsageHistory] = useState<Array<{ timestamp: Date; usage: number }>>([])
  const [apiKeys, setApiKeys] = useState<APIKeyInfo[]>([])

  const quota = state.connection?.quota

  // Simulate usage history (in real implementation, this would come from the state manager)
  useEffect(() => {
    const generateMockHistory = () => {
      const history = []
      const now = new Date()
      for (let i = 23; i >= 0; i--) {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000) // Last 24 hours
        const usage = Math.floor(Math.random() * 50) + 10 // Random usage between 10-60
        history.push({ timestamp, usage })
      }
      return history
    }

    setUsageHistory(generateMockHistory())
  }, [])

  // Simulate API keys (in real implementation, this would come from the state manager)
  useEffect(() => {
    const mockKeys: APIKeyInfo[] = [
      {
        id: 'key-1',
        name: 'Primary API Key',
        isActive: true,
        quotaUsed: 850,
        quotaLimit: 1000,
        lastUsed: new Date(),
        status: 'active'
      },
      {
        id: 'key-2',
        name: 'Backup API Key',
        isActive: false,
        quotaUsed: 200,
        quotaLimit: 1000,
        lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000),
        status: 'inactive'
      }
    ]
    setApiKeys(mockKeys)
  }, [])

  const calculateUsageProjections = useCallback((): UsageProjection => {
    if (usageHistory.length < 2) {
      return {
        currentRate: 0,
        projectedDailyUsage: 0,
        projectedWeeklyUsage: 0,
        projectedMonthlyUsage: 0,
        timeToQuotaExhaustion: Infinity
      }
    }

    // Calculate current rate based on last few hours
    const recentHours = usageHistory.slice(-6) // Last 6 hours
    const totalRecentUsage = recentHours.reduce((sum, entry) => sum + entry.usage, 0)
    const currentRate = totalRecentUsage / recentHours.length

    const projectedDailyUsage = currentRate * 24
    const projectedWeeklyUsage = projectedDailyUsage * 7
    const projectedMonthlyUsage = projectedDailyUsage * 30

    // Calculate time to quota exhaustion
    const totalAvailableQuota = apiKeys.reduce((sum, key) => 
      sum + (key.quotaLimit - key.quotaUsed), 0
    )
    const timeToQuotaExhaustion = totalAvailableQuota / Math.max(currentRate, 1)

    return {
      currentRate,
      projectedDailyUsage,
      projectedWeeklyUsage,
      projectedMonthlyUsage,
      timeToQuotaExhaustion
    }
  }, [usageHistory, apiKeys])

  const formatTime = (hours: number): string => {
    if (hours === Infinity) return 'Never'
    if (hours < 1) return `${Math.round(hours * 60)}m`
    if (hours < 24) return `${Math.round(hours)}h`
    if (hours < 168) return `${Math.round(hours / 24)}d`
    return `${Math.round(hours / 168)}w`
  }

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return Math.round(num).toString()
  }

  const getAPIKeyStatusColor = (status: APIKeyInfo['status']): string => {
    switch (status) {
      case 'active': return 'text-green-400'
      case 'inactive': return 'text-gray-400'
      case 'expired': return 'text-red-400'
      case 'error': return 'text-orange-400'
      default: return 'text-gray-400'
    }
  }

  const getQuotaHealthStatus = (): { status: 'healthy' | 'warning' | 'critical', message: string } => {
    if (!quota) return { status: 'warning', message: 'Quota status unknown' }
    
    if (quota.isQuotaExceeded) {
      return { status: 'critical', message: 'Quota exceeded' }
    }
    
    const utilizationRate = quota.totalKeys > 0 
      ? ((quota.totalKeys - quota.availableKeys) / quota.totalKeys) * 100 
      : 0

    if (utilizationRate > 90) {
      return { status: 'critical', message: 'Quota nearly exhausted' }
    } else if (utilizationRate > 70) {
      return { status: 'warning', message: 'High quota usage' }
    } else {
      return { status: 'healthy', message: 'Quota usage normal' }
    }
  }

  const projections = calculateUsageProjections()
  const healthStatus = getQuotaHealthStatus()

  return (
    <GlassCard className={`p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Quota Management</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            healthStatus.status === 'healthy' ? 'bg-green-400' :
            healthStatus.status === 'warning' ? 'bg-yellow-400' :
            'bg-red-400'
          }`} />
          <span className="text-sm opacity-75">{healthStatus.message}</span>
          {onRefreshQuota && (
            <GlassButton 
              onClick={onRefreshQuota}
              className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-700"
            >
              🔄
            </GlassButton>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-4">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1 text-sm rounded transition-colors ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white'
              : 'bg-black/20 hover:bg-black/30'
          }`}
        >
          Overview
        </button>
        {showAPIKeyManagement && (
          <button
            onClick={() => setActiveTab('keys')}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              activeTab === 'keys'
                ? 'bg-blue-600 text-white'
                : 'bg-black/20 hover:bg-black/30'
            }`}
          >
            API Keys
          </button>
        )}
        {showUsageProjections && (
          <button
            onClick={() => setActiveTab('projections')}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              activeTab === 'projections'
                ? 'bg-blue-600 text-white'
                : 'bg-black/20 hover:bg-black/30'
            }`}
          >
            Projections
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Current Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-black/10 rounded">
              <div className="text-sm opacity-75">Available Quota</div>
              <div className="text-xl font-bold">
                {quota?.availableKeys || 0} / {quota?.totalKeys || 0}
              </div>
              <div className="text-xs opacity-60">
                {quota ? ((quota.availableKeys / Math.max(quota.totalKeys, 1)) * 100).toFixed(1) : 0}% remaining
              </div>
            </div>
            <div className="p-3 bg-black/10 rounded">
              <div className="text-sm opacity-75">Current Rate</div>
              <div className="text-xl font-bold">
                {formatNumber(projections.currentRate)}/h
              </div>
              <div className="text-xs opacity-60">
                Requests per hour
              </div>
            </div>
          </div>

          {/* Usage Chart Placeholder */}
          <div className="p-4 bg-black/10 rounded">
            <div className="text-sm font-medium mb-2">Usage Last 24 Hours</div>
            <div className="flex items-end space-x-1 h-20">
              {usageHistory.slice(-12).map((entry, index) => (
                <div
                  key={index}
                  className="flex-1 bg-blue-500 rounded-t"
                  style={{ height: `${(entry.usage / 60) * 100}%` }}
                  title={`${entry.usage} requests at ${entry.timestamp.toLocaleTimeString()}`}
                />
              ))}
            </div>
            <div className="text-xs opacity-60 mt-1">
              Average: {formatNumber(usageHistory.reduce((sum, h) => sum + h.usage, 0) / usageHistory.length)} requests/hour
            </div>
          </div>
        </div>
      )}

      {activeTab === 'keys' && showAPIKeyManagement && (
        <div className="space-y-3">
          {/* Add Key Button */}
          {onAddAPIKey && (
            <GlassButton
              onClick={onAddAPIKey}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              <span className="mr-1">+</span>
              Add API Key
            </GlassButton>
          )}

          {/* API Keys List */}
          {apiKeys.map(key => (
            <div key={key.id} className="p-3 bg-black/10 rounded">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${getAPIKeyStatusColor(key.status).replace('text-', 'bg-')}`} />
                  <span className="font-medium">{key.name}</span>
                  <span className={`text-xs px-2 py-1 rounded ${getAPIKeyStatusColor(key.status)} bg-black/20`}>
                    {key.status}
                  </span>
                </div>
                {onRemoveAPIKey && (
                  <button
                    onClick={() => onRemoveAPIKey(key.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="opacity-75">Usage</div>
                  <div className="font-mono">{key.quotaUsed} / {key.quotaLimit}</div>
                </div>
                <div>
                  <div className="opacity-75">Utilization</div>
                  <div className="font-mono">{((key.quotaUsed / key.quotaLimit) * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="opacity-75">Last Used</div>
                  <div className="font-mono text-xs">{key.lastUsed.toLocaleTimeString()}</div>
                </div>
              </div>

              {/* Usage Bar */}
              <div className="mt-2">
                <div className="w-full bg-black/20 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${
                      key.quotaUsed / key.quotaLimit > 0.9 ? 'bg-red-500' :
                      key.quotaUsed / key.quotaLimit > 0.7 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${(key.quotaUsed / key.quotaLimit) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'projections' && showUsageProjections && (
        <div className="space-y-4">
          {/* Projections Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-black/10 rounded">
              <div className="text-sm opacity-75">Daily Projection</div>
              <div className="text-lg font-bold">{formatNumber(projections.projectedDailyUsage)}</div>
            </div>
            <div className="p-3 bg-black/10 rounded">
              <div className="text-sm opacity-75">Weekly Projection</div>
              <div className="text-lg font-bold">{formatNumber(projections.projectedWeeklyUsage)}</div>
            </div>
            <div className="p-3 bg-black/10 rounded">
              <div className="text-sm opacity-75">Monthly Projection</div>
              <div className="text-lg font-bold">{formatNumber(projections.projectedMonthlyUsage)}</div>
            </div>
            <div className="p-3 bg-black/10 rounded">
              <div className="text-sm opacity-75">Time to Exhaustion</div>
              <div className="text-lg font-bold">{formatTime(projections.timeToQuotaExhaustion)}</div>
            </div>
          </div>

          {/* Recommendations */}
          {showRecommendations && (
            <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded">
              <div className="font-medium mb-2">💡 Optimization Suggestions</div>
              <ul className="text-sm space-y-1 opacity-90">
                {projections.timeToQuotaExhaustion < 24 && (
                  <li>• ⚠️ Add more API keys - quota will exhaust in {formatTime(projections.timeToQuotaExhaustion)}</li>
                )}
                {projections.currentRate > 50 && (
                  <li>• Consider implementing request batching to reduce API calls</li>
                )}
                {projections.projectedMonthlyUsage > 50000 && (
                  <li>• Evaluate upgrading to a higher quota tier</li>
                )}
                <li>• Monitor usage patterns to identify peak hours</li>
                <li>• Implement caching to reduce redundant API calls</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  )
}

export default QuotaManagement
