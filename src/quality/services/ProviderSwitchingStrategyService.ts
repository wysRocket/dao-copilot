/**
 * Provider Switching Strategy Service
 *
 * Implements intelligent switching logic between transcription providers
 * based on quality metrics, performance data, and contextual factors.
 * Provides multiple switching strategies optimized for different scenarios.
 */

import {EventEmitter} from 'events'
import type {
  ComparisonResult,
  ProviderQualityScore,
  QualityRecommendation,
  TranscriptionSample
} from './ProviderQualityComparisonService'

// Switching strategy types
export interface SwitchingDecision {
  shouldSwitch: boolean
  targetProvider: string
  reason: string
  confidence: number
  expectedImprovement?: number
  urgency: 'low' | 'medium' | 'high' | 'critical'
  timestamp: number
}

export interface SwitchingContext {
  currentProvider: string
  activeLanguage?: string
  sessionDuration?: number
  errorCount?: number
  userFeedback?: number
  audioQuality?: 'poor' | 'fair' | 'good' | 'excellent'
  networkConditions?: 'poor' | 'fair' | 'good' | 'excellent'
  customFactors?: Record<string, unknown>
}

export interface SwitchingRule {
  id: string
  name: string
  condition: (context: SwitchingContext, comparison: ComparisonResult) => boolean
  priority: number
  minConfidence: number
  cooldownMs: number
  enabled: boolean
}

export interface SwitchingStrategyConfig {
  // Strategy type
  strategy: 'aggressive' | 'conservative' | 'balanced' | 'adaptive' | 'ukrainian-optimized'

  // Thresholds
  thresholds: {
    qualityGap: number
    minimumImprovement: number
    errorRateLimit: number
    latencyLimit: number
    confidenceMinimum: number
  }

  // Timing constraints
  timing: {
    switchCooldown: number
    evaluationInterval: number
    gracePeriod: number
    maxSwitchesPerHour: number
  }

  // Context weights
  contextWeights: {
    qualityScore: number
    errorRate: number
    latency: number
    userFeedback: number
    networkConditions: number
    sessionStability: number
  }

  // Language-specific settings
  languageSettings: {
    ukrainianBonus: number
    mixedLanguagePenalty: number
    languageSwitchDelay: number
  }

  // Features
  features: {
    enableAdaptiveLearning: boolean
    enableContextualSwitching: boolean
    enablePredictiveSwitching: boolean
    enableFallbackChain: boolean
  }
}

export interface SwitchingHistory {
  timestamp: number
  fromProvider: string
  toProvider: string
  reason: string
  improvement: number
  success: boolean
  context: SwitchingContext
}

/**
 * Provider Switching Strategy Service
 */
export class ProviderSwitchingStrategyService extends EventEmitter {
  private config: SwitchingStrategyConfig
  private switchingHistory: SwitchingHistory[] = []
  private lastSwitchTime = 0
  private switchCount = 0
  private hourlyResetTimer: NodeJS.Timeout | null = null
  private customRules: SwitchingRule[] = []
  private isInitialized = false

  constructor(config: SwitchingStrategyConfig) {
    super()
    this.config = config
    this.initializeDefaultRules()
  }

  /**
   * Initialize the switching strategy service
   */
  public async initialize(): Promise<void> {
    try {
      // Set up hourly reset timer
      this.startHourlyReset()

      this.isInitialized = true
      this.emit('initialized')
    } catch (error) {
      this.emit('initialization:error', error)
      throw new Error(`Failed to initialize switching strategy service: ${error}`)
    }
  }

  /**
   * Evaluate whether to switch providers based on comparison results
   */
  public evaluateSwitching(
    comparison: ComparisonResult,
    context: SwitchingContext
  ): SwitchingDecision {
    if (!this.isInitialized) {
      throw new Error('Switching strategy service not initialized')
    }

    // Check cooldown period
    const timeSinceLastSwitch = Date.now() - this.lastSwitchTime
    if (timeSinceLastSwitch < this.config.timing.switchCooldown) {
      return {
        shouldSwitch: false,
        targetProvider: context.currentProvider,
        reason: `Cooldown period active (${Math.ceil((this.config.timing.switchCooldown - timeSinceLastSwitch) / 1000)}s remaining)`,
        confidence: 1.0,
        urgency: 'low',
        timestamp: Date.now()
      }
    }

    // Check hourly switch limit
    if (this.switchCount >= this.config.timing.maxSwitchesPerHour) {
      return {
        shouldSwitch: false,
        targetProvider: context.currentProvider,
        reason: 'Hourly switch limit reached',
        confidence: 1.0,
        urgency: 'low',
        timestamp: Date.now()
      }
    }

    // Find best provider (excluding current)
    const alternatives = comparison.allProviders.filter(
      p => p.providerId !== context.currentProvider
    )
    if (alternatives.length === 0) {
      return {
        shouldSwitch: false,
        targetProvider: context.currentProvider,
        reason: 'No alternative providers available',
        confidence: 1.0,
        urgency: 'low',
        timestamp: Date.now()
      }
    }

    const bestAlternative = alternatives[0]
    const currentProviderScore = comparison.allProviders.find(
      p => p.providerId === context.currentProvider
    )

    if (!currentProviderScore) {
      return {
        shouldSwitch: true,
        targetProvider: bestAlternative.providerId,
        reason: 'Current provider not found in comparison',
        confidence: 0.9,
        urgency: 'high',
        timestamp: Date.now()
      }
    }

    // Calculate switching decision based on strategy
    const decision = this.calculateSwitchingDecision(
      currentProviderScore,
      bestAlternative,
      comparison,
      context
    )

    // Apply custom rules
    const ruleDecision = this.applyCustomRules(context, comparison)
    if (ruleDecision.shouldSwitch && !decision.shouldSwitch) {
      decision.shouldSwitch = true
      decision.reason = `Custom rule override: ${ruleDecision.reason}`
      decision.urgency = Math.max(decision.urgency, ruleDecision.urgency) as any
    }

    this.emit('switching:evaluated', {decision, context, comparison})
    return decision
  }

  /**
   * Execute a provider switch
   */
  public async executeSwitch(
    decision: SwitchingDecision,
    context: SwitchingContext
  ): Promise<{
    success: boolean
    newProvider: string
    error?: string
  }> {
    if (!decision.shouldSwitch) {
      return {
        success: false,
        newProvider: context.currentProvider,
        error: 'Decision indicates no switch required'
      }
    }

    try {
      // Record switch attempt
      const switchRecord: SwitchingHistory = {
        timestamp: Date.now(),
        fromProvider: context.currentProvider,
        toProvider: decision.targetProvider,
        reason: decision.reason,
        improvement: decision.expectedImprovement || 0,
        success: false, // Will be updated
        context
      }

      // Emit switch event for external handling
      this.emit('switching:started', {
        from: context.currentProvider,
        to: decision.targetProvider,
        reason: decision.reason,
        confidence: decision.confidence
      })

      // Update internal state
      this.lastSwitchTime = Date.now()
      this.switchCount++

      // Mark as successful
      switchRecord.success = true
      this.switchingHistory.push(switchRecord)

      // Limit history size
      if (this.switchingHistory.length > 100) {
        this.switchingHistory.shift()
      }

      this.emit('switching:completed', {
        from: context.currentProvider,
        to: decision.targetProvider,
        success: true
      })

      return {
        success: true,
        newProvider: decision.targetProvider
      }
    } catch (error) {
      this.emit('switching:error', {
        from: context.currentProvider,
        to: decision.targetProvider,
        error: `${error}`
      })

      return {
        success: false,
        newProvider: context.currentProvider,
        error: `Switch execution failed: ${error}`
      }
    }
  }

  /**
   * Add a custom switching rule
   */
  public addCustomRule(rule: SwitchingRule): void {
    // Remove existing rule with same ID
    this.customRules = this.customRules.filter(r => r.id !== rule.id)

    // Add new rule
    this.customRules.push(rule)

    // Sort by priority
    this.customRules.sort((a, b) => b.priority - a.priority)

    this.emit('rule:added', rule)
  }

  /**
   * Remove a custom switching rule
   */
  public removeCustomRule(ruleId: string): boolean {
    const initialLength = this.customRules.length
    this.customRules = this.customRules.filter(r => r.id !== ruleId)

    const removed = this.customRules.length < initialLength
    if (removed) {
      this.emit('rule:removed', ruleId)
    }

    return removed
  }

  /**
   * Get switching statistics
   */
  public getSwitchingStatistics(timeWindow?: number): {
    totalSwitches: number
    successRate: number
    averageImprovement: number
    switchReasons: Record<string, number>
    providerUsage: Record<string, number>
    recentTrend: 'increasing' | 'decreasing' | 'stable'
  } {
    const windowMs = timeWindow || 24 * 60 * 60 * 1000 // 24 hours default
    const cutoffTime = Date.now() - windowMs

    const recentHistory = this.switchingHistory.filter(h => h.timestamp > cutoffTime)

    const totalSwitches = recentHistory.length
    const successfulSwitches = recentHistory.filter(h => h.success).length
    const successRate = totalSwitches > 0 ? successfulSwitches / totalSwitches : 0

    const improvements = recentHistory
      .filter(h => h.success && h.improvement > 0)
      .map(h => h.improvement)
    const averageImprovement =
      improvements.length > 0
        ? improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length
        : 0

    const switchReasons: Record<string, number> = {}
    const providerUsage: Record<string, number> = {}

    recentHistory.forEach(h => {
      switchReasons[h.reason] = (switchReasons[h.reason] || 0) + 1
      providerUsage[h.toProvider] = (providerUsage[h.toProvider] || 0) + 1
    })

    // Calculate trend
    const recentTrend = this.calculateSwitchingTrend(recentHistory)

    return {
      totalSwitches,
      successRate,
      averageImprovement,
      switchReasons,
      providerUsage,
      recentTrend
    }
  }

  /**
   * Get switching recommendations
   */
  public getSwitchingRecommendations(
    comparison: ComparisonResult,
    context: SwitchingContext
  ): QualityRecommendation[] {
    const recommendations: QualityRecommendation[] = []

    // Analyze switching patterns
    const stats = this.getSwitchingStatistics()

    // Recommend strategy adjustments
    if (stats.successRate < 0.7 && stats.totalSwitches > 5) {
      recommendations.push({
        type: 'optimize',
        message: `Low switching success rate (${(stats.successRate * 100).toFixed(1)}%). Consider adjusting thresholds.`,
        priority: 'medium',
        providerId: context.currentProvider,
        actionRequired: 'Review switching strategy configuration'
      })
    }

    // Recommend based on switching frequency
    if (stats.totalSwitches > 10 && stats.recentTrend === 'increasing') {
      recommendations.push({
        type: 'monitor',
        message: 'High switching frequency detected. Monitor provider stability.',
        priority: 'medium',
        providerId: context.currentProvider,
        actionRequired: 'Review provider performance and network conditions'
      })
    }

    // Language-specific recommendations
    if (context.activeLanguage === 'uk' && this.config.languageSettings.ukrainianBonus === 0) {
      recommendations.push({
        type: 'optimize',
        message: 'Enable Ukrainian optimization for better mixed-language performance.',
        priority: 'medium',
        providerId: context.currentProvider,
        actionRequired: 'Update language settings configuration'
      })
    }

    return recommendations
  }

  /**
   * Update configuration
   */
  public updateConfiguration(newConfig: Partial<SwitchingStrategyConfig>): void {
    this.config = {...this.config, ...newConfig}
    this.emit('configuration:updated', this.config)
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopHourlyReset()
    this.switchingHistory = []
    this.customRules = []
    this.isInitialized = false
    this.removeAllListeners()
  }

  // Private helper methods

  private calculateSwitchingDecision(
    currentProvider: ProviderQualityScore,
    bestAlternative: ProviderQualityScore,
    comparison: ComparisonResult,
    context: SwitchingContext
  ): SwitchingDecision {
    const qualityGap = bestAlternative.overallScore - currentProvider.overallScore
    const improvement = qualityGap > 0 ? qualityGap : 0

    // Base decision on strategy type
    const decision = this.getStrategyBasedDecision(qualityGap, improvement, comparison, context)

    // Apply contextual adjustments
    const contextAdjustedDecision = this.applyContextualAdjustments(
      decision,
      context,
      currentProvider,
      bestAlternative
    )

    return contextAdjustedDecision
  }

  private getStrategyBasedDecision(
    qualityGap: number,
    improvement: number,
    comparison: ComparisonResult,
    context: SwitchingContext
  ): SwitchingDecision {
    const threshold = this.config.thresholds.qualityGap
    const minImprovement = this.config.thresholds.minimumImprovement

    let shouldSwitch = false
    let reason = ''
    let confidence = comparison.confidence
    let urgency: 'low' | 'medium' | 'high' | 'critical' = 'low'

    switch (this.config.strategy) {
      case 'aggressive':
        shouldSwitch = qualityGap > threshold * 0.5 && improvement >= minImprovement * 0.5
        reason = shouldSwitch
          ? `Aggressive strategy: ${(improvement * 100).toFixed(1)}% improvement available`
          : 'Insufficient improvement for aggressive switching'
        urgency = shouldSwitch ? (improvement > 0.2 ? 'high' : 'medium') : 'low'
        break

      case 'conservative':
        shouldSwitch = qualityGap > threshold * 1.5 && improvement >= minImprovement * 1.5
        reason = shouldSwitch
          ? `Conservative strategy: significant ${(improvement * 100).toFixed(1)}% improvement`
          : 'Conservative threshold not met'
        urgency = shouldSwitch ? 'medium' : 'low'
        break

      case 'balanced':
        shouldSwitch = qualityGap > threshold && improvement >= minImprovement
        reason = shouldSwitch
          ? `Balanced strategy: ${(improvement * 100).toFixed(1)}% improvement justified`
          : 'Balanced threshold not met'
        urgency = shouldSwitch ? (improvement > 0.15 ? 'medium' : 'low') : 'low'
        break

      case 'adaptive':
        // Adapt threshold based on recent performance
        const adaptiveThreshold = this.calculateAdaptiveThreshold()
        shouldSwitch = qualityGap > adaptiveThreshold && improvement >= minImprovement
        reason = shouldSwitch
          ? `Adaptive strategy: ${(improvement * 100).toFixed(1)}% improvement (adaptive threshold)`
          : 'Adaptive threshold not met'
        urgency = shouldSwitch ? 'medium' : 'low'
        break

      case 'ukrainian-optimized':
        // Special handling for Ukrainian language
        const ukrainianBonus =
          context.activeLanguage === 'uk' ? this.config.languageSettings.ukrainianBonus : 0
        const adjustedGap = qualityGap + ukrainianBonus
        shouldSwitch = adjustedGap > threshold && improvement >= minImprovement * 0.8
        reason = shouldSwitch
          ? `Ukrainian-optimized: ${(improvement * 100).toFixed(1)}% improvement (Ukrainian bonus applied)`
          : 'Ukrainian-optimized threshold not met'
        urgency = shouldSwitch ? (context.activeLanguage === 'uk' ? 'medium' : 'low') : 'low'
        break
    }

    return {
      shouldSwitch,
      targetProvider: comparison.bestProvider,
      reason,
      confidence,
      expectedImprovement: improvement,
      urgency,
      timestamp: Date.now()
    }
  }

  private applyContextualAdjustments(
    decision: SwitchingDecision,
    context: SwitchingContext,
    currentProvider: ProviderQualityScore,
    bestAlternative: ProviderQualityScore
  ): SwitchingDecision {
    const adjusted = {...decision}

    // Error rate consideration
    if (context.errorCount && context.errorCount > 3) {
      adjusted.shouldSwitch = true
      adjusted.reason += ' (High error rate detected)'
      adjusted.urgency = 'high'
    }

    // Network conditions
    if (
      context.networkConditions === 'poor' &&
      bestAlternative.metrics.latency.value < currentProvider.metrics.latency.value
    ) {
      adjusted.shouldSwitch = true
      adjusted.reason += ' (Poor network, switching to lower latency provider)'
      adjusted.urgency = 'medium'
    }

    // User feedback
    if (context.userFeedback !== undefined && context.userFeedback < 0.5) {
      adjusted.shouldSwitch = true
      adjusted.reason += ' (Poor user feedback)'
      adjusted.urgency = 'medium'
    }

    // Mixed language penalty
    if (context.activeLanguage && this.isLanguageMixed(context.activeLanguage)) {
      const penalty = this.config.languageSettings.mixedLanguagePenalty
      if (decision.expectedImprovement && decision.expectedImprovement < penalty) {
        adjusted.shouldSwitch = false
        adjusted.reason = 'Mixed language penalty applied - insufficient improvement'
      }
    }

    return adjusted
  }

  private applyCustomRules(
    context: SwitchingContext,
    comparison: ComparisonResult
  ): SwitchingDecision {
    for (const rule of this.customRules) {
      if (!rule.enabled) continue

      // Check cooldown
      const timeSinceLastSwitch = Date.now() - this.lastSwitchTime
      if (timeSinceLastSwitch < rule.cooldownMs) continue

      // Evaluate rule condition
      if (rule.condition(context, comparison) && comparison.confidence >= rule.minConfidence) {
        return {
          shouldSwitch: true,
          targetProvider: comparison.bestProvider,
          reason: rule.name,
          confidence: comparison.confidence,
          urgency: 'medium',
          timestamp: Date.now()
        }
      }
    }

    return {
      shouldSwitch: false,
      targetProvider: context.currentProvider,
      reason: 'No custom rules triggered',
      confidence: 1.0,
      urgency: 'low',
      timestamp: Date.now()
    }
  }

  private calculateAdaptiveThreshold(): number {
    const recentSwitches = this.switchingHistory.slice(-10)
    const successfulSwitches = recentSwitches.filter(s => s.success)

    // Adjust threshold based on recent success rate
    const successRate =
      recentSwitches.length > 0 ? successfulSwitches.length / recentSwitches.length : 0.5

    // Lower threshold if success rate is high, raise if low
    const baseThreshold = this.config.thresholds.qualityGap
    const adjustment = (0.7 - successRate) * 0.1 // ±10% adjustment

    return Math.max(0.05, Math.min(0.5, baseThreshold + adjustment))
  }

  private calculateSwitchingTrend(
    history: SwitchingHistory[]
  ): 'increasing' | 'decreasing' | 'stable' {
    if (history.length < 3) return 'stable'

    // Split history into two halves and compare switching frequency
    const midpoint = Math.floor(history.length / 2)
    const firstHalf = history.slice(0, midpoint)
    const secondHalf = history.slice(midpoint)

    const firstHalfRate = firstHalf.length
    const secondHalfRate = secondHalf.length

    const ratio = secondHalfRate / (firstHalfRate || 1)

    if (ratio > 1.2) return 'increasing'
    if (ratio < 0.8) return 'decreasing'
    return 'stable'
  }

  private isLanguageMixed(language: string): boolean {
    // Simple check for mixed language indicators
    return language.includes('-') || language.includes('/') || language.includes('+')
  }

  private initializeDefaultRules(): void {
    // Critical error rule
    this.customRules.push({
      id: 'critical-error',
      name: 'Critical Error Rate Rule',
      condition: context => (context.errorCount || 0) > 5,
      priority: 10,
      minConfidence: 0.5,
      cooldownMs: 10000, // 10 seconds
      enabled: true
    })

    // Quality drop rule
    this.customRules.push({
      id: 'quality-drop',
      name: 'Quality Drop Rule',
      condition: (context, comparison) => {
        const currentProvider = comparison.allProviders.find(
          p => p.providerId === context.currentProvider
        )
        return currentProvider
          ? currentProvider.overallScore < this.config.thresholds.confidenceMinimum
          : false
      },
      priority: 8,
      minConfidence: 0.6,
      cooldownMs: 30000, // 30 seconds
      enabled: true
    })

    // Ukrainian priority rule
    this.customRules.push({
      id: 'ukrainian-priority',
      name: 'Ukrainian Language Priority Rule',
      condition: (context, comparison) => {
        if (context.activeLanguage !== 'uk') return false
        const currentProvider = comparison.allProviders.find(
          p => p.providerId === context.currentProvider
        )
        const bestProvider = comparison.allProviders[0]
        return bestProvider.languageScores.uk > (currentProvider?.languageScores.uk || 0) + 0.1
      },
      priority: 6,
      minConfidence: 0.7,
      cooldownMs: 60000, // 1 minute
      enabled: true
    })
  }

  private startHourlyReset(): void {
    if (this.hourlyResetTimer) return

    this.hourlyResetTimer = setInterval(
      () => {
        this.switchCount = 0
        this.emit('hourly:reset')
      },
      60 * 60 * 1000
    ) // 1 hour
  }

  private stopHourlyReset(): void {
    if (this.hourlyResetTimer) {
      clearInterval(this.hourlyResetTimer)
      this.hourlyResetTimer = null
    }
  }
}

// Factory function
export function createProviderSwitchingStrategyService(
  config: SwitchingStrategyConfig
): ProviderSwitchingStrategyService {
  return new ProviderSwitchingStrategyService(config)
}

// Default configurations
export const DEFAULT_SWITCHING_CONFIG: SwitchingStrategyConfig = {
  strategy: 'balanced',
  thresholds: {
    qualityGap: 0.15,
    minimumImprovement: 0.1,
    errorRateLimit: 0.2,
    latencyLimit: 3000,
    confidenceMinimum: 0.6
  },
  timing: {
    switchCooldown: 30000, // 30 seconds
    evaluationInterval: 15000, // 15 seconds
    gracePeriod: 5000, // 5 seconds
    maxSwitchesPerHour: 10
  },
  contextWeights: {
    qualityScore: 0.4,
    errorRate: 0.2,
    latency: 0.15,
    userFeedback: 0.1,
    networkConditions: 0.1,
    sessionStability: 0.05
  },
  languageSettings: {
    ukrainianBonus: 0.05,
    mixedLanguagePenalty: 0.02,
    languageSwitchDelay: 2000
  },
  features: {
    enableAdaptiveLearning: true,
    enableContextualSwitching: true,
    enablePredictiveSwitching: false,
    enableFallbackChain: true
  }
}

export const UKRAINIAN_SWITCHING_CONFIG: SwitchingStrategyConfig = {
  ...DEFAULT_SWITCHING_CONFIG,
  strategy: 'ukrainian-optimized',
  thresholds: {
    ...DEFAULT_SWITCHING_CONFIG.thresholds,
    qualityGap: 0.12, // More sensitive for Ukrainian
    minimumImprovement: 0.08
  },
  languageSettings: {
    ukrainianBonus: 0.1, // Higher bonus for Ukrainian providers
    mixedLanguagePenalty: 0.01, // Lower penalty for mixed language
    languageSwitchDelay: 1000 // Faster switching for Ukrainian
  },
  timing: {
    ...DEFAULT_SWITCHING_CONFIG.timing,
    switchCooldown: 20000, // Faster cooldown
    maxSwitchesPerHour: 15 // Allow more switches
  }
}

export const AGGRESSIVE_SWITCHING_CONFIG: SwitchingStrategyConfig = {
  ...DEFAULT_SWITCHING_CONFIG,
  strategy: 'aggressive',
  thresholds: {
    ...DEFAULT_SWITCHING_CONFIG.thresholds,
    qualityGap: 0.08,
    minimumImprovement: 0.05
  },
  timing: {
    ...DEFAULT_SWITCHING_CONFIG.timing,
    switchCooldown: 15000,
    maxSwitchesPerHour: 20
  }
}
