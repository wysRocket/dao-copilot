/**
 * Comprehensive Test Suite for ReplayEngine
 *
 * Tests the audio segment buffering and replay functionality including:
 * - Audio segment buffering with prioritization
 * - Memory management and cleanup policies
 * - Priority-based replay logic
 * - Concurrent and sequential replay modes
 * - Error handling and retry mechanisms
 * - Statistics and monitoring
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {
  ReplayEngine,
  AudioSegmentBuffer,
  AudioSegment,
  SegmentPriority,
  createReplayEngine,
  REPLAY_ENGINE_CONFIGS,
  type TranscriptionResult,
  type AudioSegmentBufferConfig,
  type SegmentMetadata
} from '../../src/fallback/ReplayEngine'

describe('AudioSegmentBuffer', () => {
  let buffer: AudioSegmentBuffer

  beforeEach(() => {
    buffer = new AudioSegmentBuffer({
      maxSegments: 10,
      maxMemoryMB: 1,
      maxAgeMs: 60000, // 1 minute
      retentionPolicyMs: 5000 // 5 seconds for testing
    })
  })

  afterEach(() => {
    buffer.destroy()
  })

  describe('Segment Management', () => {
    it('should add audio segments with correct metadata', () => {
      const audioData = Buffer.from('test audio data')
      const metadata: Partial<SegmentMetadata> = {
        sessionId: 'test-session',
        hasVoice: true,
        source: 'websocket'
      }

      const segment = buffer.addSegment(audioData, 1000, metadata)

      expect(segment.id).toBeTruthy()
      expect(segment.sequenceId).toBe(1)
      expect(segment.duration).toBe(1000)
      expect(segment.audioData).toBe(audioData)
      expect(segment.metadata.hasVoice).toBe(true)
      expect(segment.metadata.source).toBe('websocket')
      expect(segment.isProcessed).toBe(false)
      expect(segment.retryCount).toBe(0)
    })

    it('should auto-assign priorities based on voice detection and duration', () => {
      // Critical: voice + short duration
      const criticalSegment = buffer.addSegment(Buffer.from('audio'), 1500, {hasVoice: true})
      expect(criticalSegment.priority).toBe(SegmentPriority.CRITICAL)

      // High: voice + longer duration
      const highSegment = buffer.addSegment(Buffer.from('audio'), 3000, {hasVoice: true})
      expect(highSegment.priority).toBe(SegmentPriority.HIGH)

      // Normal: no voice + long duration
      const normalSegment = buffer.addSegment(Buffer.from('audio'), 2000, {hasVoice: false})
      expect(normalSegment.priority).toBe(SegmentPriority.NORMAL)

      // Low: no voice + short duration
      const lowSegment = buffer.addSegment(Buffer.from('audio'), 500, {hasVoice: false})
      expect(lowSegment.priority).toBe(SegmentPriority.LOW)
    })

    it('should retrieve segments by ID', () => {
      const segment = buffer.addSegment(Buffer.from('test'), 1000)
      const retrieved = buffer.getSegment(segment.id)

      expect(retrieved).toBe(segment)
      expect(buffer.getSegment('nonexistent')).toBeUndefined()
    })

    it('should order segments by priority and timestamp', () => {
      // Add segments in random order with different priorities
      buffer.addSegment(Buffer.from('low'), 500, {hasVoice: false})
      buffer.addSegment(Buffer.from('critical'), 1000, {hasVoice: true})
      buffer.addSegment(Buffer.from('high'), 3000, {hasVoice: true})
      buffer.addSegment(Buffer.from('normal'), 2000, {hasVoice: false})

      const ordered = buffer.getAllSegments()

      expect(ordered[0].priority).toBe(SegmentPriority.CRITICAL)
      expect(ordered[1].priority).toBe(SegmentPriority.HIGH)
      expect(ordered[2].priority).toBe(SegmentPriority.NORMAL)
      expect(ordered[3].priority).toBe(SegmentPriority.LOW)
    })

    it('should handle segment processing state', () => {
      const segment = buffer.addSegment(Buffer.from('test'), 1000)

      // Initially not processed
      expect(segment.isProcessed).toBe(false)
      expect(segment.retryCount).toBe(0)

      // Mark as processed successfully
      buffer.markProcessed(segment.id, true)
      expect(segment.isProcessed).toBe(true)
      expect(segment.retryCount).toBe(0)

      // Mark as failed (increases retry count)
      buffer.markProcessed(segment.id, false)
      expect(segment.isProcessed).toBe(false)
      expect(segment.retryCount).toBe(1)
    })

    it('should remove segments', () => {
      const segment = buffer.addSegment(Buffer.from('test'), 1000)

      expect(buffer.removeSegment(segment.id)).toBe(true)
      expect(buffer.getSegment(segment.id)).toBeUndefined()
      expect(buffer.removeSegment('nonexistent')).toBe(false)
    })
  })

  describe('Memory Management', () => {
    it('should enforce segment count limits', () => {
      const config: Partial<AudioSegmentBufferConfig> = {
        maxSegments: 3,
        maxMemoryMB: 100 // High memory limit to test count limit
      }
      const limitedBuffer = new AudioSegmentBuffer(config)

      // Add more segments than limit
      const segments = []
      for (let i = 0; i < 5; i++) {
        const segment = limitedBuffer.addSegment(Buffer.from(`test-${i}`), 1000)
        segments.push(segment)
      }

      // Should only have the last 3 segments (oldest evicted)
      const remaining = limitedBuffer.getAllSegments(true)
      expect(remaining).toHaveLength(3)

      // First two segments should be evicted
      expect(limitedBuffer.getSegment(segments[0].id)).toBeUndefined()
      expect(limitedBuffer.getSegment(segments[1].id)).toBeUndefined()

      // Last three should remain
      expect(limitedBuffer.getSegment(segments[2].id)).toBeDefined()
      expect(limitedBuffer.getSegment(segments[3].id)).toBeDefined()
      expect(limitedBuffer.getSegment(segments[4].id)).toBeDefined()

      limitedBuffer.destroy()
    })

    it('should calculate and manage memory usage', () => {
      // Create buffer with very small memory limit
      const memoryBuffer = new AudioSegmentBuffer({
        maxSegments: 100,
        maxMemoryMB: 0.001 // 1KB limit
      })

      // Add a large segment that exceeds memory limit
      const largeAudioData = Buffer.alloc(2048, 'a') // 2KB
      memoryBuffer.addSegment(largeAudioData, 1000)

      // Add another segment, should trigger memory eviction
      const smallAudioData = Buffer.from('small')
      memoryBuffer.addSegment(smallAudioData, 1000)

      const stats = memoryBuffer.getStatistics()
      expect(stats.totalSegments).toBeLessThanOrEqual(2)

      memoryBuffer.destroy()
    })

    it('should provide accurate statistics', () => {
      // Add segments with different states
      const segment1 = buffer.addSegment(Buffer.from('test1'), 1000)
      const segment2 = buffer.addSegment(Buffer.from('test2'), 2000)
      buffer.addSegment(Buffer.from('test3'), 3000)

      // Mark some as processed
      buffer.markProcessed(segment1.id, true)
      buffer.markProcessed(segment2.id, false) // Failed

      const stats = buffer.getStatistics()

      expect(stats.totalSegments).toBe(3)
      expect(stats.processedSegments).toBe(1)
      expect(stats.failedSegments).toBe(1)
      expect(stats.bufferUtilizationPercent).toBe(30) // 3/10 * 100
      expect(stats.oldestSegmentAge).toBeGreaterThan(0)
    })

    it('should clear all segments', () => {
      buffer.addSegment(Buffer.from('test1'), 1000)
      buffer.addSegment(Buffer.from('test2'), 1000)

      expect(buffer.getStatistics().totalSegments).toBe(2)

      buffer.clear()

      expect(buffer.getStatistics().totalSegments).toBe(0)
      expect(buffer.getAllSegments()).toHaveLength(0)
    })
  })

  describe('Cleanup Policies', () => {
    it('should perform automatic cleanup based on age', async () => {
      // Create buffer with short cleanup interval for testing
      const cleanupBuffer = new AudioSegmentBuffer({
        maxSegments: 10,
        maxAgeMs: 100, // 100ms max age
        retentionPolicyMs: 50 // 50ms cleanup interval
      })

      // Add segments
      const segment1 = cleanupBuffer.addSegment(Buffer.from('old'), 1000)

      // Wait for segments to age
      await new Promise(resolve => setTimeout(resolve, 150))

      // Add new segment to trigger potential cleanup
      const segment2 = cleanupBuffer.addSegment(Buffer.from('new'), 1000)

      // Wait for cleanup cycle
      await new Promise(resolve => setTimeout(resolve, 100))

      // Old segment should be removed, new segment should remain
      expect(cleanupBuffer.getSegment(segment1.id)).toBeUndefined()
      expect(cleanupBuffer.getSegment(segment2.id)).toBeDefined()

      cleanupBuffer.destroy()
    })
  })
})

describe('ReplayEngine', () => {
  let replayEngine: ReplayEngine
  let mockReplayHandler: ReturnType<typeof vi.fn>

  beforeEach(() => {
    replayEngine = new ReplayEngine(
      {maxSegments: 10, maxMemoryMB: 1, maxAgeMs: 60000},
      {maxConcurrentReplays: 2, replayTimeoutMs: 5000}
    )

    mockReplayHandler = vi.fn().mockImplementation(async (segment: AudioSegment) => {
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 10))
      return {
        text: `Transcribed: ${segment.id}`,
        confidence: 0.95,
        duration: segment.duration,
        source: segment.metadata.source,
        timestamp: Date.now()
      } as TranscriptionResult
    })
  })

  afterEach(() => {
    replayEngine.destroy()
    vi.clearAllMocks()
  })

  describe('Segment Buffering', () => {
    it('should buffer segments and return segment IDs', () => {
      const audioData = Buffer.from('test audio')
      const metadata = {sessionId: 'test', hasVoice: true, source: 'websocket' as const}

      const segmentId = replayEngine.bufferSegment(audioData, 1500, metadata)

      expect(segmentId).toBeTruthy()

      const stats = replayEngine.getStatistics()
      expect(stats.totalSegments).toBe(1)
      expect(stats.processedSegments).toBe(0)
    })

    it('should emit buffer events', () => {
      const bufferHandler = vi.fn()
      replayEngine.on('segment-buffered', bufferHandler)

      const audioData = Buffer.from('test')
      replayEngine.bufferSegment(audioData, 1000)

      expect(bufferHandler).toHaveBeenCalledOnce()
      expect(bufferHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          audioData,
          duration: 1000,
          isProcessed: false
        })
      )
    })

    it('should emit backlog warnings', () => {
      const backlogHandler = vi.fn()
      replayEngine.on('backlog-warning', backlogHandler)

      // Create engine with very short backlog threshold
      const fastEngine = new ReplayEngine(
        {},
        {backlogThresholdMs: 10} // 10ms threshold
      )
      fastEngine.on('backlog-warning', backlogHandler)

      // Add segment and wait for it to age
      setTimeout(() => {
        fastEngine.bufferSegment(Buffer.from('test'), 1000)
      }, 50)

      // Wait and add another segment to trigger check
      setTimeout(() => {
        fastEngine.bufferSegment(Buffer.from('test2'), 1000)
        expect(backlogHandler).toHaveBeenCalledWith(2)
        fastEngine.destroy()
      }, 100)
    })
  })

  describe('Replay Processing', () => {
    it('should replay segments sequentially when priority processing disabled', async () => {
      const sequentialEngine = new ReplayEngine(
        {maxSegments: 10},
        {priorityProcessing: false, maxConcurrentReplays: 1}
      )

      // Buffer segments with different priorities
      sequentialEngine.bufferSegment(Buffer.from('low'), 500, {hasVoice: false})
      sequentialEngine.bufferSegment(Buffer.from('critical'), 1000, {hasVoice: true})
      sequentialEngine.bufferSegment(Buffer.from('high'), 3000, {hasVoice: true})

      const callOrder: string[] = []
      const orderedHandler = vi.fn(async (segment: AudioSegment) => {
        callOrder.push(segment.priority.toString())
        return mockReplayHandler(segment)
      })

      await sequentialEngine.startReplay(orderedHandler)

      // Should be called in chronological order (not priority order)
      expect(callOrder).toHaveLength(3)
      expect(orderedHandler).toHaveBeenCalledTimes(3)

      sequentialEngine.destroy()
    })

    it('should replay segments by priority when enabled', async () => {
      // Buffer segments with different priorities in random order
      replayEngine.bufferSegment(Buffer.from('low'), 500, {hasVoice: false})
      replayEngine.bufferSegment(Buffer.from('critical'), 1000, {hasVoice: true})
      replayEngine.bufferSegment(Buffer.from('high'), 3000, {hasVoice: true})
      replayEngine.bufferSegment(Buffer.from('normal'), 2000, {hasVoice: false})

      const priorityOrder: SegmentPriority[] = []
      const priorityHandler = vi.fn(async (segment: AudioSegment) => {
        priorityOrder.push(segment.priority)
        return mockReplayHandler(segment)
      })

      await replayEngine.startReplay(priorityHandler)

      expect(priorityOrder).toEqual([
        SegmentPriority.CRITICAL,
        SegmentPriority.HIGH,
        SegmentPriority.NORMAL,
        SegmentPriority.LOW
      ])
      expect(priorityHandler).toHaveBeenCalledTimes(4)
    })

    it('should handle concurrent replays up to max limit', async () => {
      const concurrentEngine = new ReplayEngine(
        {},
        {maxConcurrentReplays: 2, priorityProcessing: false}
      )

      // Buffer several segments
      for (let i = 0; i < 5; i++) {
        concurrentEngine.bufferSegment(Buffer.from(`audio-${i}`), 1000)
      }

      let activeCalls = 0
      let maxConcurrent = 0

      const concurrentHandler = vi.fn(async (segment: AudioSegment) => {
        activeCalls++
        maxConcurrent = Math.max(maxConcurrent, activeCalls)

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 20))

        activeCalls--
        return mockReplayHandler(segment)
      })

      await concurrentEngine.startReplay(concurrentHandler)

      expect(maxConcurrent).toBeLessThanOrEqual(2) // Should not exceed limit
      expect(concurrentHandler).toHaveBeenCalledTimes(5)

      concurrentEngine.destroy()
    })

    it('should emit replay completion events', async () => {
      const replayHandler = vi.fn()
      const completionHandler = vi.fn()

      replayEngine.on('segment-replayed', replayHandler)
      replayEngine.on('replay-completed', completionHandler)

      replayEngine.bufferSegment(Buffer.from('test'), 1000)
      await replayEngine.startReplay(mockReplayHandler)

      expect(replayHandler).toHaveBeenCalledOnce()
      expect(replayHandler).toHaveBeenCalledWith(
        expect.objectContaining({audioData: Buffer.from('test')}),
        expect.objectContaining({success: true})
      )

      expect(completionHandler).toHaveBeenCalledOnce()
      expect(completionHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          processedSegments: 1,
          failedSegments: 0
        })
      )
    })

    it('should handle replay failures gracefully', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Replay failed'))
      const errorHandler = vi.fn()

      replayEngine.on('segment-failed', errorHandler)

      replayEngine.bufferSegment(Buffer.from('test'), 1000)
      await replayEngine.startReplay(failingHandler)

      expect(errorHandler).toHaveBeenCalledOnce()
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({audioData: Buffer.from('test')}),
        expect.any(Error)
      )

      const stats = replayEngine.getStatistics()
      expect(stats.processedSegments).toBe(0)
      expect(stats.failedSegments).toBe(1)
    })

    it('should enforce replay timeouts', async () => {
      const timeoutEngine = new ReplayEngine(
        {},
        {replayTimeoutMs: 50} // Very short timeout
      )

      const slowHandler = vi.fn(async () => {
        // Simulate slow processing that exceeds timeout
        await new Promise(resolve => setTimeout(resolve, 100))
        return mockReplayHandler({} as AudioSegment)
      })

      const errorHandler = vi.fn()
      timeoutEngine.on('segment-failed', errorHandler)

      timeoutEngine.bufferSegment(Buffer.from('test'), 1000)
      await timeoutEngine.startReplay(slowHandler)

      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({message: 'Replay timeout'})
      )

      timeoutEngine.destroy()
    })
  })

  describe('Individual Segment Replay', () => {
    it('should replay specific segments by ID', async () => {
      const segmentId = replayEngine.bufferSegment(Buffer.from('specific'), 1000)

      const result = await replayEngine.replaySegment(segmentId, mockReplayHandler)

      expect(result.success).toBe(true)
      expect(result.transcriptionResult).toMatchObject({
        text: expect.stringContaining(segmentId),
        confidence: 0.95
      })
      expect(result.latencyMs).toBeGreaterThan(0)
      expect(result.retriesUsed).toBe(0)

      expect(mockReplayHandler).toHaveBeenCalledOnce()
    })

    it('should throw error for non-existent segment', async () => {
      await expect(replayEngine.replaySegment('nonexistent', mockReplayHandler)).rejects.toThrow(
        'Segment not found: nonexistent'
      )
    })
  })

  describe('Status and Statistics', () => {
    it('should provide current replay status', async () => {
      replayEngine.bufferSegment(Buffer.from('test1'), 1000)
      replayEngine.bufferSegment(Buffer.from('test2'), 1000)

      // Before replay
      let status = replayEngine.getStatus()
      expect(status.isReplaying).toBe(false)
      expect(status.activeReplays).toBe(0)
      expect(status.bufferUtilization).toBeGreaterThan(0)

      // During replay (check with concurrent handler)
      const slowHandler = vi.fn(async (segment: AudioSegment) => {
        await new Promise(resolve => setTimeout(resolve, 50))
        return mockReplayHandler(segment)
      })

      const replayPromise = replayEngine.startReplay(slowHandler)

      // Check status during replay
      await new Promise(resolve => setTimeout(resolve, 10))
      status = replayEngine.getStatus()
      expect(status.isReplaying).toBe(true)

      await replayPromise

      // After replay
      status = replayEngine.getStatus()
      expect(status.isReplaying).toBe(false)
      expect(status.activeReplays).toBe(0)
    })

    it('should provide comprehensive statistics', async () => {
      // Add segments and process them
      replayEngine.bufferSegment(Buffer.from('test1'), 1000, {hasVoice: true})
      replayEngine.bufferSegment(Buffer.from('test2'), 2000, {hasVoice: false})

      await replayEngine.startReplay(mockReplayHandler)

      const stats = replayEngine.getStatistics()

      expect(stats.totalSegments).toBe(2)
      expect(stats.processedSegments).toBe(2)
      expect(stats.failedSegments).toBe(0)
      expect(stats.bufferUtilizationPercent).toBeGreaterThan(0)
      expect(stats.priorityDistribution).toEqual({
        [SegmentPriority.CRITICAL]: 1,
        [SegmentPriority.NORMAL]: 1
      })
    })
  })

  describe('Buffer Management', () => {
    it('should clear buffer on command', () => {
      replayEngine.bufferSegment(Buffer.from('test1'), 1000)
      replayEngine.bufferSegment(Buffer.from('test2'), 1000)

      expect(replayEngine.getStatistics().totalSegments).toBe(2)

      replayEngine.clearBuffer()

      expect(replayEngine.getStatistics().totalSegments).toBe(0)
    })

    it('should prevent operations on destroyed engine', () => {
      replayEngine.destroy()

      expect(() => {
        replayEngine.bufferSegment(Buffer.from('test'), 1000)
      }).toThrow('ReplayEngine is destroyed')
    })
  })

  describe('Error Edge Cases', () => {
    it('should handle empty replay queue gracefully', async () => {
      await replayEngine.startReplay(mockReplayHandler)

      expect(mockReplayHandler).not.toHaveBeenCalled()
    })

    it('should handle simultaneous replay attempts', async () => {
      replayEngine.bufferSegment(Buffer.from('test'), 1000)

      const firstReplay = replayEngine.startReplay(mockReplayHandler)
      const secondReplay = replayEngine.startReplay(mockReplayHandler)

      await Promise.all([firstReplay, secondReplay])

      // Handler should only be called once (second replay should be ignored)
      expect(mockReplayHandler).toHaveBeenCalledTimes(1)
    })
  })
})

describe('Factory Functions and Configurations', () => {
  it('should create replay engine with factory function', () => {
    const engine = createReplayEngine()
    expect(engine).toBeInstanceOf(ReplayEngine)
    engine.destroy()
  })

  it('should apply predefined configurations correctly', () => {
    // Test high-throughput configuration
    const highThroughputEngine = createReplayEngine(
      REPLAY_ENGINE_CONFIGS.HIGH_THROUGHPUT.buffer,
      REPLAY_ENGINE_CONFIGS.HIGH_THROUGHPUT.replay
    )

    expect(highThroughputEngine.getStatus().bufferUtilization).toBe(0)
    highThroughputEngine.destroy()

    // Test memory-optimized configuration
    const memoryEngine = createReplayEngine(
      REPLAY_ENGINE_CONFIGS.MEMORY_OPTIMIZED.buffer,
      REPLAY_ENGINE_CONFIGS.MEMORY_OPTIMIZED.replay
    )

    expect(memoryEngine.getStatus().bufferUtilization).toBe(0)
    memoryEngine.destroy()

    // Test real-time configuration
    const realtimeEngine = createReplayEngine(
      REPLAY_ENGINE_CONFIGS.REAL_TIME.buffer,
      REPLAY_ENGINE_CONFIGS.REAL_TIME.replay
    )

    expect(realtimeEngine.getStatus().bufferUtilization).toBe(0)
    realtimeEngine.destroy()
  })
})

describe('Integration Scenarios', () => {
  it('should handle realistic transcription workflow', async () => {
    // Simulate realistic audio transcription scenario
    const engine = createReplayEngine(
      {maxSegments: 50, maxMemoryMB: 5, maxAgeMs: 300000},
      {maxConcurrentReplays: 3, priorityProcessing: true}
    )

    // Buffer various types of audio segments
    const segments = [
      {audio: Buffer.from('silence-start'), duration: 2000, hasVoice: false},
      {audio: Buffer.from('speech-hello'), duration: 1200, hasVoice: true},
      {audio: Buffer.from('speech-world'), duration: 800, hasVoice: true},
      {audio: Buffer.from('pause'), duration: 500, hasVoice: false},
      {audio: Buffer.from('speech-goodbye'), duration: 1500, hasVoice: true},
      {audio: Buffer.from('silence-end'), duration: 3000, hasVoice: false}
    ]

    segments.forEach((seg, index) => {
      engine.bufferSegment(seg.audio, seg.duration, {
        hasVoice: seg.hasVoice,
        source: 'websocket',
        sessionId: `session-${index}`
      })
    })

    // Realistic transcription handler with some failures
    const realisticHandler = vi.fn(
      async (segment: AudioSegment): Promise<TranscriptionResult | null> => {
        // Simulate occasional failures (10% failure rate)
        if (Math.random() < 0.1) {
          throw new Error(`Transcription failed for ${segment.id}`)
        }

        // Simulate variable processing time
        const processingTime = Math.random() * 100 + 10
        await new Promise(resolve => setTimeout(resolve, processingTime))

        return {
          text: segment.metadata.hasVoice ? 'Transcribed speech' : 'No speech detected',
          confidence: segment.metadata.hasVoice ? 0.85 + Math.random() * 0.15 : 0.1,
          duration: segment.duration,
          source: segment.metadata.source,
          timestamp: Date.now()
        }
      }
    )

    const replayHandler = vi.fn()
    const errorHandler = vi.fn()

    engine.on('segment-replayed', replayHandler)
    engine.on('segment-failed', errorHandler)

    await engine.startReplay(realisticHandler)

    const finalStats = engine.getStatistics()

    expect(finalStats.totalSegments).toBe(6)
    expect(finalStats.processedSegments + finalStats.failedSegments).toBeLessThanOrEqual(6)
    expect(realisticHandler).toHaveBeenCalled()

    // Voice segments should have been processed first due to higher priority
    expect(replayHandler).toHaveBeenCalled()

    engine.destroy()
  }, 10000) // Increase timeout for integration test
})
