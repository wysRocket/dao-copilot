import React, { useState, useEffect, useRef } from 'react';
import { useRealTimeTranscription, RealTimeTranscriptionStatus } from '../hooks/useRealTimeTranscription';

interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
  confidence?: number;
  isFinal: boolean;
}

/**
 * Zero-latency transcription display component
 * Handles real-time speech-to-text with instant updates
 */
export const ZeroLatencyTranscriptionDisplay: React.FC<{
  className?: string;
  maxEntries?: number;
  showTimestamps?: boolean;
  showConfidence?: boolean;
  autoStart?: boolean;
}> = ({ 
  className = '',
  maxEntries = 100,
  showTimestamps = false,
  showConfidence = false,
  autoStart = false
}) => {
  const {
    isInitialized,
    isConnected,
    currentTranscript,
    finalTranscripts,
    error,
    latency,
    reconnectAttempts,
    start,
    stop,
    clearTranscripts,
    isActive,
    hasError
  } = useRealTimeTranscription({ autoStart, confidenceThreshold: 0.3 });

  const [displayEntries, setDisplayEntries] = useState<TranscriptEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  // Update display entries when transcripts change
  useEffect(() => {
    const entries: TranscriptEntry[] = [];

    // Add final transcripts
    finalTranscripts.forEach((transcript, index) => {
      entries.push({
        id: `final-${index}`,
        text: transcript.text,
        timestamp: transcript.timestamp,
        confidence: transcript.confidence,
        isFinal: true
      });
    });

    // Add current interim transcript
    if (currentTranscript) {
      entries.push({
        id: 'current',
        text: currentTranscript,
        timestamp: Date.now(),
        isFinal: false
      });
    }

    // Limit entries
    const limitedEntries = entries.slice(-maxEntries);
    setDisplayEntries(limitedEntries);
  }, [finalTranscripts, currentTranscript, maxEntries]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (isAutoScrollEnabled && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayEntries, isAutoScrollEnabled]);

  // Handle manual scroll (disable auto-scroll if user scrolls up)
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setIsAutoScrollEnabled(isAtBottom);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-gray-400';
    if (confidence > 0.8) return 'text-green-500';
    if (confidence > 0.6) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className={`flex flex-col h-full bg-black text-white ${className}`}>
      {/* Header with controls and status */}
      <div className="p-4 border-b border-gray-700 bg-gray-900">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Zero-Latency Transcription</h2>
          <div className="flex items-center space-x-2">
            {!isActive ? (
              <button
                onClick={start}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                disabled={isInitialized && !isConnected}
              >
                {isInitialized ? 'Reconnect' : 'Start'}
              </button>
            ) : (
              <button
                onClick={stop}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Stop
              </button>
            )}
            <button
              onClick={clearTranscripts}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Status display */}
        <RealTimeTranscriptionStatus
          latency={latency}
          isConnected={isConnected}
          reconnectAttempts={reconnectAttempts}
          error={error}
        />

        {/* Performance metrics */}
        <div className="mt-2 text-sm text-gray-400 font-mono">
          Entries: {displayEntries.length} | 
          Final: {finalTranscripts.length} | 
          {currentTranscript && ` Interim: "${currentTranscript.slice(0, 30)}${currentTranscript.length > 30 ? '...' : ''}"`}
        </div>
      </div>

      {/* Transcription display */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 p-4 overflow-y-auto space-y-2"
        style={{ scrollBehavior: 'smooth' }}
      >
        {hasError && (
          <div className="bg-red-900 border border-red-600 rounded-lg p-3 mb-4">
            <div className="font-semibold text-red-300">Error</div>
            <div className="text-red-200">{error}</div>
          </div>
        )}

        {!isActive && !hasError && (
          <div className="text-center text-gray-400 py-8">
            <div className="text-lg mb-2">🎤 Ready for Real-Time Transcription</div>
            <div>Click "Start" to begin zero-latency speech-to-text</div>
          </div>
        )}

        {isActive && displayEntries.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <div className="text-lg mb-2">👂 Listening...</div>
            <div>Speak to see real-time transcription</div>
          </div>
        )}

        {displayEntries.map((entry) => (
          <div
            key={entry.id}
            className={`p-3 rounded-lg border transition-all duration-200 ${
              entry.isFinal 
                ? 'bg-gray-800 border-gray-600 text-white' 
                : 'bg-blue-900 border-blue-600 text-blue-100 animate-pulse'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className={`${entry.isFinal ? 'text-white' : 'text-blue-100'}`}>
                  {entry.text}
                </div>
                
                {(showTimestamps || showConfidence) && (
                  <div className="flex items-center space-x-4 mt-1 text-xs text-gray-400">
                    {showTimestamps && (
                      <span>{formatTime(entry.timestamp)}</span>
                    )}
                    {showConfidence && entry.confidence && (
                      <span className={getConfidenceColor(entry.confidence)}>
                        {(entry.confidence * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="ml-2 flex items-center space-x-1">
                {entry.isFinal ? (
                  <span className="text-green-400 text-xs">✓</span>
                ) : (
                  <span className="text-blue-400 text-xs animate-pulse">●</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Auto-scroll indicator */}
      {!isAutoScrollEnabled && (
        <div className="absolute bottom-4 right-4">
          <button
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                setIsAutoScrollEnabled(true);
              }
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-full text-sm shadow-lg transition-colors"
          >
            ↓ New messages
          </button>
        </div>
      )}
    </div>
  );
};

export default ZeroLatencyTranscriptionDisplay;
