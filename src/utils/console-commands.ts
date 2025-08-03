/**
 * Console Commands for Telemetry and Protection System Management
 * Provides browser console commands for diagnostics, testing, and monitoring
 */

import {UnifiedTelemetrySystem} from '../services/UnifiedTelemetrySystem'
import {EmergencyCircuitBreaker} from './EmergencyCircuitBreaker'
import {DuplicateRequestDetector} from './DuplicateRequestDetector'
import {
  diagnostics,
  runTranscriptionDiagnostics,
  resetCircuitBreakers,
  checkCircuitBreakerStatus
} from './transcription-diagnostics'
import {runStackOverflowProtectionTest} from './stack-overflow-protection-test'

/**
 * Run comprehensive transcription system diagnostics
 */
export const runTranscriptionDiagnosticsCommand = async (): Promise<unknown> => {
  console.log('🔍 Starting comprehensive transcription diagnostics...')

  try {
    const results = await runTranscriptionDiagnostics()
    const report = diagnostics.generateReport()

    console.log('📊 Diagnostics Report:')
    console.log(report)

    return results
  } catch (error) {
    console.error('❌ Failed to run diagnostics:', error)
    return null
  }
}

/**
 * Test circuit breaker reset functionality
 */
export const testCircuitBreakerReset = (): boolean => {
  console.log('🧪 Testing circuit breaker reset functionality...')

  try {
    const breaker = EmergencyCircuitBreaker.getInstance()

    // Get initial status
    const initialStatus = breaker.getEmergencyStatus()
    const initialTripped = breaker.getTrippedBreakers()

    console.log('📊 Initial circuit breaker status:', {
      trippedBreakers: initialTripped.length,
      totalBreakers: Object.keys(initialStatus).length
    })

    // Attempt manual reset
    const resetSuccess = resetCircuitBreakers()

    if (resetSuccess) {
      // Verify reset worked
      const afterStatus = breaker.getTrippedBreakers()
      console.log('✅ Circuit breaker reset test completed successfully')
      console.log('📊 After reset:', {
        trippedBreakers: afterStatus.length,
        resetWorked: afterStatus.length === 0
      })
      return true
    } else {
      console.log('❌ Circuit breaker reset test failed')
      return false
    }
  } catch (error) {
    console.error('❌ Circuit breaker reset test error:', error)
    return false
  }
}

/**
 * Run stack overflow protection tests
 */
export const runStackOverflowProtectionTestCommand = async (): Promise<unknown> => {
  console.log('🛡️ Running stack overflow protection tests...')

  try {
    const results = await runStackOverflowProtectionTest()

    console.log('📊 Stack Overflow Protection Test Results:')
    results.forEach(result => {
      const emoji = result.status === 'PASS' ? '✅' : '❌'
      console.log(`${emoji} ${result.test}: ${result.details}`)
    })

    const passCount = results.filter(r => r.status === 'PASS').length
    const failCount = results.filter(r => r.status === 'FAIL').length

    console.log(`\n📈 Summary: ${passCount} passed, ${failCount} failed`)

    if (failCount === 0) {
      console.log('🎉 All stack overflow protection tests passed!')
    } else {
      console.warn('⚠️ Some protection tests failed - check implementation')
    }

    return results
  } catch (error) {
    console.error('❌ Failed to run stack overflow protection tests:', error)
    return null
  }
}

/**
 * Get real-time telemetry dashboard data
 */
export const getTelemetryDashboard = (): unknown => {
  console.log('📊 Loading telemetry dashboard...')

  try {
    const telemetry = UnifiedTelemetrySystem.getInstance()
    const dashboardData = telemetry.getDashboardData()

    console.log('📈 Telemetry Dashboard Data:')
    console.log('─'.repeat(50))

    // Metrics overview
    console.log('🔢 Key Metrics:')
    console.log(`  Total Requests: ${dashboardData.metrics.totalRequests}`)
    console.log(
      `  Success Rate: ${((dashboardData.metrics.successfulRequests / dashboardData.metrics.totalRequests) * 100 || 0).toFixed(1)}%`
    )
    console.log(`  Error Rate: ${dashboardData.metrics.errorRate.toFixed(1)}%`)
    console.log(`  Avg Response Time: ${dashboardData.metrics.averageResponseTime.toFixed(0)}ms`)
    console.log(`  Uptime: ${(dashboardData.metrics.uptime / 1000 / 60).toFixed(1)} minutes`)

    console.log('\n🛡️ Protection Status:')
    console.log(`  Circuit Breaker Trips: ${dashboardData.metrics.circuitBreakerTrips}`)
    console.log(`  Duplicates Blocked: ${dashboardData.metrics.duplicateRequestsBlocked}`)
    console.log(`  Stack Overflows Prevented: ${dashboardData.metrics.stackOverflowsPrevented}`)
    console.log(`  Total Protection Events: ${dashboardData.metrics.totalProtectionEvents}`)

    console.log('\n⚡ System Health:')
    console.log(`  Connection Health: ${dashboardData.metrics.connectionHealth}%`)
    console.log(`  Memory Usage: ${dashboardData.metrics.memoryUsage.toFixed(1)} MB`)
    console.log(`  Requests/Minute: ${dashboardData.metrics.requestsPerMinute}`)
    console.log(`  Errors/Minute: ${dashboardData.metrics.errorsPerMinute}`)

    // Recent events
    console.log('\n📰 Recent Events (last 10):')
    const recentEvents = dashboardData.events.slice(0, 10)
    recentEvents.forEach(event => {
      const timestamp = new Date(event.timestamp).toLocaleTimeString()
      const emoji = event.emoji || '📊'
      console.log(`  ${timestamp} ${emoji} ${event.message}`)
    })

    // Active alerts
    const activeAlerts = dashboardData.alerts.filter(alert => alert.enabled)
    console.log(`\n🚨 Active Alerts: ${activeAlerts.length}`)
    activeAlerts.forEach(alert => {
      const lastTriggered = alert.lastTriggered
        ? new Date(alert.lastTriggered).toLocaleTimeString()
        : 'Never'
      console.log(`  ${alert.name} (${alert.severity}) - Last: ${lastTriggered}`)
    })

    return dashboardData
  } catch (error) {
    console.error('❌ Failed to load telemetry dashboard:', error)
    return null
  }
}

/**
 * Run comprehensive protection system tests
 */
export const runProtectionSystemTests = async (): Promise<void> => {
  console.log('🧪 Running comprehensive protection system tests...')

  try {
    // Test 1: Circuit breaker functionality
    console.log('\n🔧 Test 1: Circuit Breaker Reset')
    testCircuitBreakerReset()

    // Test 2: Stack overflow protection
    console.log('\n🛡️ Test 2: Stack Overflow Protection')
    await runStackOverflowProtectionTestCommand()

    // Test 3: Duplicate request detection
    console.log('\n🚫 Test 3: Duplicate Request Detection')
    await testDuplicateRequestDetection()

    // Test 4: Telemetry system
    console.log('\n📊 Test 4: Telemetry System')
    testTelemetrySystem()

    console.log('\n🎉 Comprehensive protection system tests completed!')
  } catch (error) {
    console.error('❌ Failed to run comprehensive tests:', error)
  }
}

/**
 * Test duplicate request detection system
 */
export const testDuplicateRequestDetection = async (): Promise<void> => {
  console.log('🚫 Testing duplicate request detection...')

  try {
    const detector = DuplicateRequestDetector.getInstance()
    const testBuffer = Buffer.from('test-audio-content-for-duplicate-detection')

    // Get initial stats
    const initialStats = detector.getStatistics()
    console.log('📊 Initial duplicate detector stats:', {
      totalRequests: initialStats.totalRequests,
      duplicatesBlocked: initialStats.recentActivity.duplicatesBlocked
    })

    // Test duplicate detection
    console.log('🧪 Testing duplicate detection with identical requests...')

    const result1 = detector.checkRequest(testBuffer, {sourceType: 'test'})
    console.log('  First request:', result1.isAllowed ? '✅ Allowed' : '❌ Blocked')

    const result2 = detector.checkRequest(testBuffer, {sourceType: 'test'})
    console.log(
      '  Duplicate request:',
      result2.isAllowed ? '❌ Should be blocked' : '✅ Correctly blocked'
    )

    // Test throttling
    console.log('🧪 Testing throttling with rapid requests...')
    let blockedCount = 0

    for (let i = 0; i < 25; i++) {
      const testBuffer = Buffer.from(`rapid-test-${i}`)
      const result = detector.checkRequest(testBuffer, {
        sourceType: 'test-rapid',
        timestamp: Date.now() + i
      })
      if (!result.isAllowed) {
        blockedCount++
      }
    }

    console.log(`  Rapid requests: ${blockedCount}/25 blocked due to throttling`)

    // Get final stats
    const finalStats = detector.getStatistics()
    console.log('📊 Final duplicate detector stats:', {
      totalRequests: finalStats.totalRequests,
      duplicatesBlocked: finalStats.recentActivity.duplicatesBlocked,
      throttledRequests: finalStats.recentActivity.throttledRequests
    })

    console.log('✅ Duplicate request detection test completed')
  } catch (error) {
    console.error('❌ Duplicate request detection test failed:', error)
  }
}

/**
 * Test telemetry system functionality
 */
export const testTelemetrySystem = (): void => {
  console.log('📊 Testing telemetry system...')

  try {
    const telemetry = UnifiedTelemetrySystem.getInstance()

    // Test request tracking
    console.log('🧪 Testing request tracking...')
    const requestId = telemetry.recordRequestStart()
    console.log(`  Request started: ${requestId}`)

    // Simulate response time
    setTimeout(() => {
      telemetry.recordRequestSuccess(requestId, 150)
      console.log('  Request completed successfully (150ms)')
    }, 100)

    // Test error tracking
    console.log('🧪 Testing error tracking...')
    const errorRequestId = telemetry.recordRequestStart()
    telemetry.recordRequestFailure(errorRequestId, new Error('Test error for telemetry'))
    console.log('  Error recorded successfully')

    // Test metrics
    const metrics = telemetry.getMetrics()
    console.log('📊 Current telemetry metrics:', {
      totalRequests: metrics.totalRequests,
      successfulRequests: metrics.successfulRequests,
      failedRequests: metrics.failedRequests,
      errorRate: metrics.errorRate.toFixed(1) + '%'
    })

    console.log('✅ Telemetry system test completed')
  } catch (error) {
    console.error('❌ Telemetry system test failed:', error)
  }
}

/**
 * Reset all protection systems and telemetry
 */
export const resetAllProtectionSystems = (): boolean => {
  console.log('🔄 Resetting all protection systems...')

  try {
    // Reset circuit breakers
    const breakerReset = resetCircuitBreakers()
    console.log(`  Circuit breakers: ${breakerReset ? '✅' : '❌'}`)

    // Reset telemetry
    const telemetry = UnifiedTelemetrySystem.getInstance()
    telemetry.resetMetrics()
    console.log('  Telemetry metrics: ✅')

    // Note: DuplicateRequestDetector doesn't have a reset method in its current API
    console.log('  Duplicate detector: ℹ️ (auto-cleanup active)')

    console.log('🎉 All protection systems reset completed!')
    return true
  } catch (error) {
    console.error('❌ Failed to reset protection systems:', error)
    return false
  }
}

/**
 * Export telemetry data to console
 */
export const exportTelemetryData = (): void => {
  console.log('📤 Exporting telemetry data...')

  try {
    const telemetry = UnifiedTelemetrySystem.getInstance()
    const data = telemetry.exportData()

    console.log('📊 Telemetry Data Export:')
    console.log(data)

    // Also provide downloadable format
    if (typeof document !== 'undefined') {
      const blob = new Blob([data], {type: 'application/json'})
      const url = URL.createObjectURL(blob)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

      const a = document.createElement('a')
      a.href = url
      a.download = `telemetry-export-${timestamp}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log('💾 Telemetry data also saved as downloadable file')
    }
  } catch (error) {
    console.error('❌ Failed to export telemetry data:', error)
  }
}

// Make functions available globally for console access
if (typeof window !== 'undefined') {
  // Expose commands to global scope for console access
  const consoleCommands = {
    runTranscriptionDiagnostics: runTranscriptionDiagnosticsCommand,
    testCircuitBreakerReset,
    runStackOverflowProtectionTest: runStackOverflowProtectionTestCommand,
    checkCircuitBreakerStatus,
    resetCircuitBreakers,
    getTelemetryDashboard,
    runProtectionSystemTests,
    testDuplicateRequestDetection,
    testTelemetrySystem,
    resetAllProtectionSystems,
    exportTelemetryData
  }

  // Add to window object
  Object.assign(window, consoleCommands)

  console.log('🎮 Console commands available:')
  console.log('  runTranscriptionDiagnostics() - Run full system diagnostics')
  console.log('  testCircuitBreakerReset() - Test circuit breaker reset')
  console.log('  runStackOverflowProtectionTest() - Test stack overflow protection')
  console.log('  checkCircuitBreakerStatus() - Check circuit breaker status')
  console.log('  resetCircuitBreakers() - Reset all circuit breakers')
  console.log('  getTelemetryDashboard() - View telemetry dashboard')
  console.log('  runProtectionSystemTests() - Run all protection tests')
  console.log('  testDuplicateRequestDetection() - Test duplicate detection')
  console.log('  testTelemetrySystem() - Test telemetry functionality')
  console.log('  resetAllProtectionSystems() - Reset all systems')
  console.log('  exportTelemetryData() - Export telemetry data')
}
