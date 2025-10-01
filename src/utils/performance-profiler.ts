/**
 * Performance profiling utility for diagnosing startup delays
 * Tracks timing from application start to first transcription display
 */

export const PERFORMANCE_MARKERS = {
  APP_START: 'app_start',
  WEBSOCKET_INIT_START: 'websocket_init_start',
  WEBSOCKET_CONNECTED: 'websocket_connected',
  AUDIO_INIT_START: 'audio_init_start',
  AUDIO_READY: 'audio_ready',
  TRANSCRIPTION_INIT_START: 'transcription_init_start',
  TRANSCRIPTION_READY: 'transcription_ready',
  FIRST_TRANSCRIPTION_RECEIVED: 'first_transcription_received',
  FIRST_TRANSCRIPTION_DISPLAY: 'first_transcription_display',
  CONNECTION_POOL_INIT_START: 'connection_pool_init_start',
  CONNECTION_POOL_INIT_COMPLETE: 'connection_pool_init_complete'
}

class PerformanceProfiler {
  private markers = new Map<string, number>()
  private isProfilingEnabled = true

  constructor() {
    // Mark app start immediately
    this.markPerformance(PERFORMANCE_MARKERS.APP_START)
  }

  markPerformance(marker: string): void {
    if (!this.isProfilingEnabled) return

    const timestamp = performance.now()
    this.markers.set(marker, timestamp)

    console.debug(`🔍 Performance marker: ${marker} at ${timestamp.toFixed(2)}ms`)

    // Also use native Performance API marks for Chrome DevTools
    if (performance.mark) {
      performance.mark(marker)
    }
  }

  getTimeBetween(startMarker: string, endMarker: string): number | null {
    if (!this.markers.has(startMarker) || !this.markers.has(endMarker)) {
      return null
    }
    return this.markers.get(endMarker)! - this.markers.get(startMarker)!
  }

  getMarkerTime(marker: string): number | null {
    return this.markers.get(marker) || null
  }

  generateReport(): {
    markers: Record<string, number>
    intervals: Record<string, number>
    bottlenecks: Array<{name: string; duration: number; severity: 'low' | 'medium' | 'high'}>
    totalTime: number
  } {
    const markers: Record<string, number> = {}
    this.markers.forEach((time, marker) => {
      markers[marker] = time
    })

    const intervals: Record<string, number> = {}
    const bottlenecks: Array<{
      name: string
      duration: number
      severity: 'low' | 'medium' | 'high'
    }> = []

    // Calculate key intervals
    const websocketTime = this.getTimeBetween(
      PERFORMANCE_MARKERS.WEBSOCKET_INIT_START,
      PERFORMANCE_MARKERS.WEBSOCKET_CONNECTED
    )
    if (websocketTime !== null) {
      intervals['WebSocket Connection'] = websocketTime
      bottlenecks.push({
        name: 'WebSocket Connection',
        duration: websocketTime,
        severity: websocketTime > 5000 ? 'high' : websocketTime > 2000 ? 'medium' : 'low'
      })
    }

    const audioTime = this.getTimeBetween(
      PERFORMANCE_MARKERS.AUDIO_INIT_START,
      PERFORMANCE_MARKERS.AUDIO_READY
    )
    if (audioTime !== null) {
      intervals['Audio Initialization'] = audioTime
      bottlenecks.push({
        name: 'Audio Initialization',
        duration: audioTime,
        severity: audioTime > 3000 ? 'high' : audioTime > 1000 ? 'medium' : 'low'
      })
    }

    const transcriptionInitTime = this.getTimeBetween(
      PERFORMANCE_MARKERS.TRANSCRIPTION_INIT_START,
      PERFORMANCE_MARKERS.TRANSCRIPTION_READY
    )
    if (transcriptionInitTime !== null) {
      intervals['Transcription Initialization'] = transcriptionInitTime
      bottlenecks.push({
        name: 'Transcription Initialization',
        duration: transcriptionInitTime,
        severity:
          transcriptionInitTime > 2000 ? 'high' : transcriptionInitTime > 500 ? 'medium' : 'low'
      })
    }

    const firstTranscriptionTime = this.getTimeBetween(
      PERFORMANCE_MARKERS.FIRST_TRANSCRIPTION_RECEIVED,
      PERFORMANCE_MARKERS.FIRST_TRANSCRIPTION_DISPLAY
    )
    if (firstTranscriptionTime !== null) {
      intervals['First Transcription Processing'] = firstTranscriptionTime
      bottlenecks.push({
        name: 'First Transcription Processing',
        duration: firstTranscriptionTime,
        severity:
          firstTranscriptionTime > 1000 ? 'high' : firstTranscriptionTime > 200 ? 'medium' : 'low'
      })
    }

    const totalTime =
      this.getTimeBetween(
        PERFORMANCE_MARKERS.APP_START,
        PERFORMANCE_MARKERS.FIRST_TRANSCRIPTION_DISPLAY
      ) || 0

    return {
      markers,
      intervals,
      bottlenecks,
      totalTime
    }
  }

  printReport(): void {
    const report = this.generateReport()

    console.group('📊 Performance Report - Startup Delay Analysis')
    console.log(`⏱️  Total Time to First Transcription: ${report.totalTime.toFixed(2)}ms`)

    console.group('🕐 Timing Intervals:')
    Object.entries(report.intervals).forEach(([name, duration]) => {
      console.log(`   ${name}: ${duration.toFixed(2)}ms`)
    })
    console.groupEnd()

    console.group('🚨 Bottlenecks (>1s):')
    report.bottlenecks
      .filter(b => b.duration > 1000)
      .sort((a, b) => b.duration - a.duration)
      .forEach(bottleneck => {
        const severityEmoji =
          bottleneck.severity === 'high' ? '🔴' : bottleneck.severity === 'medium' ? '🟡' : '🟢'
        console.log(
          `   ${severityEmoji} ${bottleneck.name}: ${bottleneck.duration.toFixed(2)}ms (${bottleneck.severity} priority)`
        )
      })
    console.groupEnd()

    console.group('📋 Raw Markers:')
    Object.entries(report.markers).forEach(([marker, time]) => {
      console.log(`   ${marker}: ${time.toFixed(2)}ms`)
    })
    console.groupEnd()

    console.groupEnd()
  }

  disable(): void {
    this.isProfilingEnabled = false
  }

  enable(): void {
    this.isProfilingEnabled = true
  }
}

// Create global instance
export const performanceProfiler = new PerformanceProfiler()

// Convenience functions
export const markPerformance = (marker: string) => performanceProfiler.markPerformance(marker)
export const getTimeBetween = (start: string, end: string) =>
  performanceProfiler.getTimeBetween(start, end)
export const generatePerformanceReport = () => performanceProfiler.generateReport()
export const printPerformanceReport = () => performanceProfiler.printReport()

// Hook for React components
export const usePerformanceProfiler = () => {
  return {
    markPerformance,
    getTimeBetween,
    generateReport: generatePerformanceReport,
    printReport: printPerformanceReport
  }
}
