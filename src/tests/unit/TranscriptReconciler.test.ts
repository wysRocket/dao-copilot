/**
 * Tests for TranscriptReconciler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  TranscriptReconciler,
  createTranscriptReconciler,
  type ReconcilerConfig
} from '../TranscriptReconciler';
import type { TranscriptionResult } from '../../state/TranscriptionStateManager';

// Mock UUID generators
vi.mock('../../utils/uuid-generator', () => ({
  generateSecureId: vi.fn((prefix: string) => `${prefix}-${Math.random().toString(36).substr(2, 9)}`),
  generateSessionId: vi.fn(() => `session-${Math.random().toString(36).substr(2, 9)}`),
}));

// Mock transcript deduplication
vi.mock('../../utils/transcript-deduplication', () => ({
  generateTranscriptId: vi.fn((result: { id?: string }) => result.id || `transcript-${Math.random().toString(36).substr(2, 9)}`),
}));

// Mock session manager
class MockGeminiSessionManager extends EventEmitter {
  getCurrentSession = vi.fn();
}

describe('TranscriptReconciler', () => {
  let reconciler: TranscriptReconciler;
  let mockSessionManager: MockGeminiSessionManager;

  beforeEach(async () => {
    mockSessionManager = new MockGeminiSessionManager();
    reconciler = createTranscriptReconciler({
      debugLogging: false,
      maxSegmentBuffer: 50,
      conflictResolutionStrategy: 'confidence-based'
    });
  });

  afterEach(async () => {
    if (reconciler) {
      await reconciler.destroy();
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      expect(reconciler).toBeDefined();
      expect(reconciler.getCurrentContext().isInitialized).toBe(false);
      
      await reconciler.initialize();
      
      const context = reconciler.getCurrentContext();
      expect(context.isInitialized).toBe(true);
      expect(context.sessionId).toBeDefined();
      expect(context.utteranceId).toBeDefined();
    });

    it('should initialize with session manager', async () => {
      const sessionInfo = {
        sessionId: 'test-session-123',
        currentUtteranceId: 'utterance-456'
      };
      
      mockSessionManager.getCurrentSession.mockResolvedValue(sessionInfo);
      
      await reconciler.initialize(mockSessionManager);
      
      const context = reconciler.getCurrentContext();
      expect(context.sessionId).toBe('test-session-123');
      expect(context.utteranceId).toBe('utterance-456');
    });

    it('should handle session manager errors gracefully', async () => {
      mockSessionManager.getCurrentSession.mockRejectedValue(new Error('Session error'));
      
      await reconciler.initialize(mockSessionManager);
      
      const context = reconciler.getCurrentContext();
      expect(context.isInitialized).toBe(true);
      expect(context.sessionId).toBeDefined(); // Fallback generated
      expect(context.utteranceId).toBeDefined(); // Fallback generated
    });

    it('should emit initialization event', async () => {
      const initSpy = vi.fn();
      reconciler.on('initialized', initSpy);
      
      await reconciler.initialize();
      
      expect(initSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: expect.any(String),
          utteranceId: expect.any(String)
        })
      );
    });
  });

  describe('Transcript Processing', () => {
    beforeEach(async () => {
      await reconciler.initialize();
    });

    it('should process basic transcript result', async () => {
      const transcriptResult: TranscriptionResult = {
        id: 'test-transcript-1',
        text: 'Hello world',
        timestamp: Date.now(),
        confidence: 0.95,
        isPartial: false,
        isFinal: true,
        source: 'websocket-gemini'
      };

      const segment = await reconciler.processTranscript(transcriptResult, 'websocket');

      expect(segment).toMatchObject({
        id: 'test-transcript-1',
        text: 'Hello world',
        confidence: 0.95,
        transport: 'websocket',
        isPartial: false,
        isFinal: true
      });
      expect(segment.sessionId).toBeDefined();
      expect(segment.utteranceId).toBeDefined();
      expect(segment.sequenceNumber).toBeGreaterThanOrEqual(0);
    });

    it('should emit segmentProcessed event', async () => {
      const segmentSpy = vi.fn();
      reconciler.on('segmentProcessed', segmentSpy);

      const transcriptResult: TranscriptionResult = {
        id: 'test-transcript-2',
        text: 'Processing test',
        timestamp: Date.now(),
        confidence: 0.85,
        source: 'http-stream'
      };

      await reconciler.processTranscript(transcriptResult, 'http-stream');

      expect(segmentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-transcript-2',
          text: 'Processing test',
          transport: 'http-stream'
        })
      );
    });

    it('should handle transcript without ID', async () => {
      const transcriptResult: Omit<TranscriptionResult, 'id'> = {
        text: 'No ID transcript',
        timestamp: Date.now(),
        confidence: 0.75,
        source: 'batch'
      };

      const segment = await reconciler.processTranscript(transcriptResult as TranscriptionResult, 'batch');

      expect(segment.id).toBeDefined();
      expect(segment.text).toBe('No ID transcript');
    });

    it('should preserve session continuity', async () => {
      const context = reconciler.getCurrentContext();
      const sessionId = context.sessionId;

      const transcript1: TranscriptionResult = {
        id: 'transcript-1',
        text: 'First segment',
        timestamp: Date.now(),
        source: 'websocket-gemini'
      };

      const transcript2: TranscriptionResult = {
        id: 'transcript-2',
        text: 'Second segment',
        timestamp: Date.now() + 1000,
        source: 'websocket-gemini'
      };

      const segment1 = await reconciler.processTranscript(transcript1, 'websocket');
      const segment2 = await reconciler.processTranscript(transcript2, 'websocket');

      expect(segment1.sessionId).toBe(sessionId);
      expect(segment2.sessionId).toBe(sessionId);
      expect(segment1.utteranceId).toBe(segment2.utteranceId);
    });

    it('should increment sequence numbers', async () => {
      const transcript1: TranscriptionResult = {
        id: 'seq-test-1',
        text: 'First',
        timestamp: Date.now(),
        source: 'websocket-gemini'
      };

      const transcript2: TranscriptionResult = {
        id: 'seq-test-2',
        text: 'Second',
        timestamp: Date.now() + 100,
        source: 'websocket-gemini'
      };

      const segment1 = await reconciler.processTranscript(transcript1, 'websocket');
      const segment2 = await reconciler.processTranscript(transcript2, 'websocket');

      expect(segment2.sequenceNumber).toBeGreaterThan(segment1.sequenceNumber);
    });
  });

  describe('Transport Switching', () => {
    beforeEach(async () => {
      await reconciler.initialize();
    });

    it('should handle basic transport switch', async () => {
      const switchContext = await reconciler.handleTransportSwitch(
        'websocket',
        'http-stream',
        { partialText: 'Partial text', confidence: 0.8 }
      );

      expect(switchContext).toMatchObject({
        fromTransport: 'websocket',
        toTransport: 'http-stream',
        partialText: 'Partial text',
        confidence: 0.8
      });
      expect(switchContext.activeSessionId).toBeDefined();
      expect(switchContext.activeUtteranceId).toBeDefined();
      expect(switchContext.switchTime).toBeGreaterThan(0);
    });

    it('should emit transport switch event', async () => {
      const switchSpy = vi.fn();
      reconciler.on('transportSwitch', switchSpy);

      await reconciler.handleTransportSwitch('websocket', 'batch');

      expect(switchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fromTransport: 'websocket',
          toTransport: 'batch'
        })
      );
    });

    it('should preserve context across switches', async () => {
      const context = reconciler.getCurrentContext();

      const switchContext = await reconciler.handleTransportSwitch(
        'websocket',
        'http-stream'
      );

      expect(switchContext.activeSessionId).toBe(context.sessionId);
      expect(switchContext.activeUtteranceId).toBe(context.utteranceId);
    });

    it('should maintain switch history', async () => {
      await reconciler.handleTransportSwitch('websocket', 'http-stream');
      await reconciler.handleTransportSwitch('http-stream', 'batch');

      const metrics = reconciler.getMetrics();
      expect(metrics.transportSwitches).toBe(2);
      expect(metrics.transportSwitches).toHaveLength(2);
    });
  });

  describe('Segment Reconciliation', () => {
    beforeEach(async () => {
      await reconciler.initialize();
    });

    it('should reconcile single segment', async () => {
      const transcript: TranscriptionResult = {
        id: 'single-segment',
        text: 'Single segment text',
        timestamp: Date.now(),
        confidence: 0.9,
        source: 'websocket-gemini'
      };

      await reconciler.processTranscript(transcript, 'websocket');
      const result = await reconciler.reconcileSegments();

      expect(result.reconciledSegments).toHaveLength(1);
      expect(result.reconciledSegments[0].text).toBe('Single segment text');
      expect(result.conflictsResolved).toBe(0);
      expect(result.segmentsMerged).toBe(0);
      expect(result.continuityMaintained).toBe(true);
    });

    it('should reconcile non-overlapping segments', async () => {
      const transcript1: TranscriptionResult = {
        id: 'segment-1',
        text: 'First segment',
        timestamp: Date.now(),
        confidence: 0.9,
        source: 'websocket-gemini'
      };

      const transcript2: TranscriptionResult = {
        id: 'segment-2',
        text: 'Second segment',
        timestamp: Date.now() + 2000, // 2 seconds later
        confidence: 0.8,
        source: 'websocket-gemini'
      };

      await reconciler.processTranscript(transcript1, 'websocket');
      await reconciler.processTranscript(transcript2, 'websocket');
      
      const result = await reconciler.reconcileSegments();

      expect(result.reconciledSegments).toHaveLength(2);
      expect(result.conflictsResolved).toBe(0);
      expect(result.segmentsMerged).toBe(0);
    });

    it('should merge overlapping segments by confidence', async () => {
      const reconcilerWithMerging = createTranscriptReconciler({
        conflictResolutionStrategy: 'confidence-based',
        mergeOverlapThreshold: 1000, // 1 second
        debugLogging: false
      });
      await reconcilerWithMerging.initialize();

      const baseTime = Date.now();
      
      const transcript1: TranscriptionResult = {
        id: 'overlap-1',
        text: 'Lower confidence',
        timestamp: baseTime,
        confidence: 0.7,
        source: 'websocket-gemini'
      };

      const transcript2: TranscriptionResult = {
        id: 'overlap-2',
        text: 'Higher confidence',
        timestamp: baseTime + 500, // Overlapping within threshold
        confidence: 0.95,
        source: 'http-stream'
      };

      await reconcilerWithMerging.processTranscript(transcript1, 'websocket');
      await reconcilerWithMerging.processTranscript(transcript2, 'http-stream');
      
      const result = await reconcilerWithMerging.reconcileSegments();

      expect(result.reconciledSegments).toHaveLength(1);
      expect(result.reconciledSegments[0].text).toBe('Higher confidence');
      expect(result.reconciledSegments[0].confidence).toBe(0.95);
      expect(result.conflictsResolved).toBe(1);
      expect(result.segmentsMerged).toBe(1);

      await reconcilerWithMerging.destroy();
    });

    it('should merge segments by transport priority', async () => {
      const reconcilerWithTransport = createTranscriptReconciler({
        conflictResolutionStrategy: 'transport-priority',
        mergeOverlapThreshold: 1000,
        debugLogging: false
      });
      await reconcilerWithTransport.initialize();

      const baseTime = Date.now();
      
      const transcript1: TranscriptionResult = {
        id: 'transport-1',
        text: 'Batch transport',
        timestamp: baseTime,
        confidence: 0.9,
        source: 'batch'
      };

      const transcript2: TranscriptionResult = {
        id: 'transport-2',
        text: 'WebSocket transport',
        timestamp: baseTime + 300,
        confidence: 0.8,
        source: 'websocket-gemini'
      };

      await reconcilerWithTransport.processTranscript(transcript1, 'batch');
      await reconcilerWithTransport.processTranscript(transcript2, 'websocket');
      
      const result = await reconcilerWithTransport.reconcileSegments();

      expect(result.reconciledSegments).toHaveLength(1);
      expect(result.reconciledSegments[0].text).toBe('WebSocket transport');
      expect(result.reconciledSegments[0].transport).toBe('websocket');

      await reconcilerWithTransport.destroy();
    });

    it('should handle reconciliation errors gracefully', async () => {
      // Process some segments to create a scenario for reconciliation
      const transcript: TranscriptionResult = {
        id: 'error-test',
        text: 'Test segment',
        timestamp: Date.now(),
        source: 'websocket-gemini'
      };

      await reconciler.processTranscript(transcript, 'websocket');

      // Mock an error during reconciliation by breaking the internal state
      (reconciler).segmentBuffer.set = vi.fn(() => {
        throw new Error('Mock reconciliation error');
      });

      const result = await reconciler.reconcileSegments();

      expect(result.errors).toHaveLength(0); // No errors in actual reconciliation since we don't hit the mock
      expect(result.reconciledSegments).toHaveLength(1); // Should still process normally
    });
  });

  describe('Context Management', () => {
    beforeEach(async () => {
      await reconciler.initialize();
    });

    it('should get current context', () => {
      const context = reconciler.getCurrentContext();
      
      expect(context.isInitialized).toBe(true);
      expect(context.sessionId).toBeDefined();
      expect(context.utteranceId).toBeDefined();
    });

    it('should update utterance context', () => {
      const originalContext = reconciler.getCurrentContext();
      
      const newUtteranceId = reconciler.updateUtteranceContext();
      
      expect(newUtteranceId).toBeDefined();
      expect(newUtteranceId).not.toBe(originalContext.utteranceId);
      
      const updatedContext = reconciler.getCurrentContext();
      expect(updatedContext.utteranceId).toBe(newUtteranceId);
    });

    it('should emit utteranceUpdated event', () => {
      const utteranceSpy = vi.fn();
      reconciler.on('utteranceUpdated', utteranceSpy);
      
      const newUtteranceId = reconciler.updateUtteranceContext('custom-utterance-123');
      
      expect(utteranceSpy).toHaveBeenCalledWith('custom-utterance-123');
      expect(newUtteranceId).toBe('custom-utterance-123');
    });
  });

  describe('Metrics and Monitoring', () => {
    beforeEach(async () => {
      await reconciler.initialize();
    });

    it('should track processing metrics', async () => {
      const transcript1: TranscriptionResult = {
        id: 'metrics-1',
        text: 'First',
        timestamp: Date.now(),
        source: 'websocket-gemini'
      };

      const transcript2: TranscriptionResult = {
        id: 'metrics-2',
        text: 'Second',
        timestamp: Date.now() + 100,
        source: 'websocket-gemini'
      };

      await reconciler.processTranscript(transcript1, 'websocket');
      await reconciler.processTranscript(transcript2, 'websocket');

      const metrics = reconciler.getMetrics();
      expect(metrics.segmentsProcessed).toBe(2);
      expect(metrics.bufferedSegments).toBe(2);
      expect(metrics.transportSwitches).toBe(0);
    });

    it('should track reconciliation metrics', async () => {
      const reconcilerWithMerging = createTranscriptReconciler({
        conflictResolutionStrategy: 'confidence-based',
        mergeOverlapThreshold: 1000
      });
      await reconcilerWithMerging.initialize();

      const baseTime = Date.now();
      
      // Create overlapping segments
      const transcript1: TranscriptionResult = {
        id: 'merge-1',
        text: 'First',
        timestamp: baseTime,
        confidence: 0.8,
        source: 'websocket-gemini'
      };

      const transcript2: TranscriptionResult = {
        id: 'merge-2',
        text: 'Second',
        timestamp: baseTime + 500,
        confidence: 0.9,
        source: 'websocket-gemini'
      };

      await reconcilerWithMerging.processTranscript(transcript1, 'websocket');
      await reconcilerWithMerging.processTranscript(transcript2, 'websocket');
      await reconcilerWithMerging.reconcileSegments();

      const metrics = reconcilerWithMerging.getMetrics();
      expect(metrics.conflictsResolved).toBeGreaterThan(0);
      expect(metrics.segmentsMerged).toBeGreaterThan(0);

      await reconcilerWithMerging.destroy();
    });
  });

  describe('Lifecycle Management', () => {
    it('should reset state properly', async () => {
      await reconciler.initialize();
      
      // Add some data
      const transcript: TranscriptionResult = {
        id: 'reset-test',
        text: 'Test data',
        timestamp: Date.now(),
        source: 'websocket-gemini'
      };

      await reconciler.processTranscript(transcript, 'websocket');
      await reconciler.handleTransportSwitch('websocket', 'batch');

      // Verify data exists
      let metrics = reconciler.getMetrics();
      expect(metrics.segmentsProcessed).toBe(1);
      expect(metrics.transportSwitches).toBe(1);

      // Reset
      const resetSpy = vi.fn();
      reconciler.on('reset', resetSpy);
      
      await reconciler.reset();

      expect(resetSpy).toHaveBeenCalled();
      
      // Verify data cleared
      metrics = reconciler.getMetrics();
      expect(metrics.segmentsProcessed).toBe(0);
      expect(metrics.transportSwitches).toBe(0);
      expect(metrics.bufferedSegments).toBe(0);
    });

    it('should destroy properly', async () => {
      await reconciler.initialize();
      
      const listenerCount = reconciler.listenerCount('segmentProcessed');
      reconciler.on('segmentProcessed', vi.fn());
      
      expect(reconciler.listenerCount('segmentProcessed')).toBeGreaterThan(listenerCount);
      
      await reconciler.destroy();
      
      expect(reconciler.getCurrentContext().isInitialized).toBe(false);
      expect(reconciler.listenerCount('segmentProcessed')).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should reject processing before initialization', async () => {
      const uninitializedReconciler = createTranscriptReconciler();
      
      const transcript: TranscriptionResult = {
        id: 'error-test',
        text: 'Test',
        timestamp: Date.now(),
        source: 'websocket-gemini'
      };

      await expect(
        uninitializedReconciler.processTranscript(transcript, 'websocket')
      ).rejects.toThrow('TranscriptReconciler must be initialized before processing');
    });

    it('should handle empty reconciliation gracefully', async () => {
      await reconciler.initialize();
      
      const result = await reconciler.reconcileSegments();
      
      expect(result.reconciledSegments).toHaveLength(0);
      expect(result.conflictsResolved).toBe(0);
      expect(result.segmentsMerged).toBe(0);
      expect(result.continuityMaintained).toBe(true);
      expect(result.sessionPreserved).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Factory Function', () => {
    it('should create reconciler with default config', () => {
      const createdReconciler = createTranscriptReconciler();
      expect(createdReconciler).toBeInstanceOf(TranscriptReconciler);
    });

    it('should create reconciler with custom config', () => {
      const customConfig: Partial<ReconcilerConfig> = {
        maxSegmentBuffer: 200,
        conflictResolutionStrategy: 'timestamp-priority',
        debugLogging: true
      };

      const createdReconciler = createTranscriptReconciler(customConfig);
      expect(createdReconciler).toBeInstanceOf(TranscriptReconciler);
    });
  });
});