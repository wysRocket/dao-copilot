/**
 * Optimized Real-Time Transcription Display
 * Uses advanced React performance patterns for minimal latency
 */

import React, { 
  memo, 
  useMemo, 
  useCallback, 
  useRef, 
  useEffect,
  useState,
  useDeferredValue 
} from 'react';
import { FixedSizeList as List } from 'react-window';
import { 
  useOptimizedTranscriptionState,
  type TranscriptionSegment 
} from '../hooks/useOptimizedTranscriptionState';

export interface OptimizedTranscriptionDisplayProps {
  /** WebSocket connection for real-time updates */
  websocketData?: any;
  /** Enable virtualization for large transcript lists */
  enableVirtualization?: boolean;
  /** Maximum segments to display */
  maxDisplaySegments?: number;
  /** Enable smooth animations */
  enableAnimations?: boolean;
  /** Custom styling */
  className?: string;
  style?: React.CSSProperties;
  /** Performance mode settings */
  performanceMode?: 'balanced' | 'speed' | 'memory';
}

/**
 * Memoized segment component for optimal re-rendering
 */
const TranscriptionSegmentItem = memo<{
  segment: TranscriptionSegment;
  index: number;
  isLatest: boolean;
  enableAnimations: boolean;
  style?: React.CSSProperties;
}>(({ segment, index, isLatest, enableAnimations, style }) => {
  const confidenceColor = useMemo(() => {
    if (segment.confidence >= 0.9) return '#28a745';
    if (segment.confidence >= 0.7) return '#ffc107';
    return '#dc3545';
  }, [segment.confidence]);

  const displayTime = useMemo(() => {
    const date = new Date(segment.timestamp);
    return date.toLocaleTimeString([], { 
      hour12: false, 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }, [segment.timestamp]);

  return (
    <div
      style={{
        ...style,
        padding: '8px 12px',
        borderBottom: '1px solid #e9ecef',
        backgroundColor: isLatest ? '#f8f9fa' : '#fff',
        opacity: segment.isPartial ? 0.7 : 1,
        transition: enableAnimations ? 'all 0.2s ease' : 'none',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '8px'
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ 
            fontSize: '16px',
            lineHeight: '1.4',
            color: '#212529',
            wordBreak: 'break-word'
          }}>
            {segment.text}
            {segment.isPartial && (
              <span style={{ 
                marginLeft: '4px',
                opacity: 0.6,
                animation: enableAnimations ? 'pulse 1s infinite' : 'none'
              }}>
                ⏳
              </span>
            )}
          </div>
        </div>
        
        <div style={{ 
          fontSize: '11px',
          color: '#6c757d',
          textAlign: 'right',
          flexShrink: 0
        }}>
          <div>{displayTime}</div>
          <div style={{ 
            color: confidenceColor,
            fontWeight: 'bold',
            marginTop: '2px'
          }}>
            {(segment.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
});

TranscriptionSegmentItem.displayName = 'TranscriptionSegmentItem';

/**
 * Virtualized list item for performance with large datasets
 */
const VirtualizedSegmentItem = memo<{
  index: number;
  style: React.CSSProperties;
  data: {
    segments: TranscriptionSegment[];
    enableAnimations: boolean;
  };
}>(({ index, style, data }) => {
  const segment = data.segments[index];
  const isLatest = index === data.segments.length - 1;

  return (
    <TranscriptionSegmentItem
      segment={segment}
      index={index}
      isLatest={isLatest}
      enableAnimations={data.enableAnimations}
      style={style}
    />
  );
});

VirtualizedSegmentItem.displayName = 'VirtualizedSegmentItem';

/**
 * Current segment display (always visible, non-virtualized)
 */
const CurrentSegmentDisplay = memo<{
  segment: TranscriptionSegment | null;
  enableAnimations: boolean;
}>(({ segment, enableAnimations }) => {
  if (!segment) {
    return (
      <div style={{
        padding: '16px 12px',
        textAlign: 'center',
        color: '#6c757d',
        fontStyle: 'italic',
        backgroundColor: '#f8f9fa',
        borderBottom: '2px solid #dee2e6'
      }}>
        Listening...
      </div>
    );
  }

  return (
    <div style={{
      padding: '12px',
      backgroundColor: '#e3f2fd',
      borderBottom: '2px solid #90caf9',
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
      <div style={{ 
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#1976d2',
        marginBottom: '4px'
      }}>
        🎤 Live
      </div>
      <div style={{
        fontSize: '16px',
        lineHeight: '1.4',
        color: '#0d47a1',
        minHeight: '22px'
      }}>
        {segment.text}
        <span style={{ 
          marginLeft: '8px',
          opacity: 0.7,
          animation: enableAnimations ? 'pulse 1s infinite' : 'none'
        }}>
          ●
        </span>
      </div>
      <div style={{
        fontSize: '12px',
        color: '#1565c0',
        marginTop: '4px'
      }}>
        Confidence: {(segment.confidence * 100).toFixed(1)}%
      </div>
    </div>
  );
});

CurrentSegmentDisplay.displayName = 'CurrentSegmentDisplay';

/**
 * Performance statistics display
 */
const PerformanceStats = memo<{
  updateCount: number;
  sessionDuration: number;
  segmentCount: number;
  wordsPerMinute: number;
  isPending: boolean;
}>(({ updateCount, sessionDuration, segmentCount, wordsPerMinute, isPending }) => {
  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  };

  return (
    <div style={{
      padding: '8px 12px',
      backgroundColor: '#f8f9fa',
      borderTop: '1px solid #dee2e6',
      fontSize: '11px',
      color: '#6c757d',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '8px'
    }}>
      <div>
        {isPending && <span style={{ color: '#ffc107' }}>⚡ Processing...</span>}
        Duration: {formatDuration(sessionDuration)}
      </div>
      <div>
        Segments: {segmentCount} | 
        Updates: {updateCount} | 
        WPM: {wordsPerMinute.toFixed(1)}
      </div>
    </div>
  );
});

PerformanceStats.displayName = 'PerformanceStats';

/**
 * Main optimized transcription display component
 */
export const OptimizedTranscriptionDisplay: React.FC<OptimizedTranscriptionDisplayProps> = ({
  websocketData,
  enableVirtualization = true,
  maxDisplaySegments = 100,
  enableAnimations = true,
  className,
  style,
  performanceMode = 'balanced'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Configure state management based on performance mode
  const stateOptions = useMemo(() => {
    switch (performanceMode) {
      case 'speed':
        return {
          maxSegments: 50,
          enableDeferredUpdates: false,
          enableTransitions: false,
          autoCleanup: true,
          cleanupThreshold: 30
        };
      case 'memory':
        return {
          maxSegments: 200,
          enableDeferredUpdates: true,
          enableTransitions: true,
          autoCleanup: true,
          cleanupThreshold: 100
        };
      default: // balanced
        return {
          maxSegments: maxDisplaySegments,
          enableDeferredUpdates: true,
          enableTransitions: true,
          autoCleanup: true,
          cleanupThreshold: Math.floor(maxDisplaySegments * 0.7)
        };
    }
  }, [performanceMode, maxDisplaySegments]);

  // Optimized state management
  const { state, actions, deferredSegments, getPerformanceMetrics } = useOptimizedTranscriptionState(stateOptions);

  // Deferred segments for non-critical rendering
  const displaySegments = useDeferredValue(deferredSegments.slice(-maxDisplaySegments));

  // Handle WebSocket data updates
  useEffect(() => {
    if (!websocketData) return;

    if (websocketData.type === 'partial') {
      actions.updateCurrentSegment(websocketData.text, websocketData.confidence);
    } else if (websocketData.type === 'final') {
      actions.finalizeCurrentSegment();
      actions.addSegment({
        id: `seg_${Date.now()}`,
        text: websocketData.text,
        confidence: websocketData.confidence || 0.8,
        isPartial: false,
        timestamp: Date.now()
      });
    }
  }, [websocketData, actions]);

  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    if (autoScroll && listRef.current && displaySegments.length > 0) {
      listRef.current.scrollToItem(displaySegments.length - 1, 'end');
    }
  }, [displaySegments.length, autoScroll]);

  // Handle scroll events to disable auto-scroll when user scrolls up
  const handleScroll = useCallback((e: any) => {
    if (!containerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    if (isAtBottom !== autoScroll) {
      setAutoScroll(isAtBottom);
    }
  }, [autoScroll]);

  // Performance metrics
  const performanceMetrics = useMemo(() => getPerformanceMetrics(), [getPerformanceMetrics]);

  // Virtual list item data
  const virtualListData = useMemo(() => ({
    segments: displaySegments,
    enableAnimations
  }), [displaySegments, enableAnimations]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#fff',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        overflow: 'hidden',
        ...style
      }}
    >
      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Current segment display */}
      <CurrentSegmentDisplay 
        segment={state.currentSegment}
        enableAnimations={enableAnimations}
      />

      {/* Transcription history */}
      <div style={{ flex: 1, position: 'relative' }}>
        {displaySegments.length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#6c757d'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎤</div>
            <div style={{ fontSize: '18px', marginBottom: '8px' }}>
              Ready for transcription
            </div>
            <div style={{ fontSize: '14px' }}>
              Start speaking to see real-time results
            </div>
          </div>
        ) : enableVirtualization && displaySegments.length > 20 ? (
          // Virtualized list for performance with large datasets
          <List
            ref={listRef}
            height={containerRef.current?.clientHeight ? containerRef.current.clientHeight - 120 : 400}
            itemCount={displaySegments.length}
            itemSize={80}
            itemData={virtualListData}
            onScroll={handleScroll}
            style={{ width: '100%' }}
          >
            {VirtualizedSegmentItem}
          </List>
        ) : (
          // Regular list for smaller datasets
          <div 
            style={{ 
              height: '100%',
              overflowY: 'auto',
              overflowX: 'hidden'
            }}
            onScroll={handleScroll}
          >
            {displaySegments.map((segment, index) => (
              <TranscriptionSegmentItem
                key={segment.id}
                segment={segment}
                index={index}
                isLatest={index === displaySegments.length - 1}
                enableAnimations={enableAnimations}
              />
            ))}
          </div>
        )}

        {/* Auto-scroll indicator */}
        {!autoScroll && displaySegments.length > 0 && (
          <button
            onClick={() => setAutoScroll(true)}
            style={{
              position: 'absolute',
              bottom: '16px',
              right: '16px',
              padding: '8px 12px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              zIndex: 100
            }}
          >
            ↓ Scroll to latest
          </button>
        )}
      </div>

      {/* Performance statistics */}
      <PerformanceStats
        updateCount={performanceMetrics.updateCount}
        sessionDuration={performanceMetrics.sessionDuration}
        segmentCount={state.segmentCount}
        wordsPerMinute={state.wordsPerMinute}
        isPending={state.isPending}
      />
    </div>
  );
};

export default OptimizedTranscriptionDisplay;
